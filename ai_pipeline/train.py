"""
H2S AI Model Training Pipeline
Implements Section 6.1 (Pages 14-22):
- Data Preparation & Zero-Leakage Verification
- MobileNetV3-Small Backbone + Classification Head
- Two-Stage Training (Frozen Backbone -> Top Layers Fine-Tuning)
- Evaluation Metrics, Confusion Matrix Plotting, and JSON Metrics Report
- Model Metadata Export & Registry Integration
"""

import os
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models, transforms
from torch.utils.data import Dataset, DataLoader
from PIL import Image
import pandas as pd
import numpy as np
from sklearn.metrics import confusion_matrix, classification_report
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
from datetime import datetime

import config

class H2SStripDataset(Dataset):
    def __init__(self, df: pd.DataFrame, transform=None):
        self.df = df.reset_index(drop=True)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = row["image_path"]
        image = Image.open(img_path).convert("RGB")
        label = int(row["class_index"])

        if self.transform:
            image = self.transform(image)

        return image, label

class H2SMobileNetV3(nn.Module):
    """MobileNetV3-Small + 256 ReLU + Dropout 0.3 + 5 Softmax Neurons (Pages 9, 16)."""
    def __init__(self, num_classes=5):
        super().__init__()
        weights = models.MobileNet_V3_Small_Weights.DEFAULT
        self.backbone = models.mobilenet_v3_small(weights=weights)
        in_features = self.backbone.classifier[0].in_features

        # Replace classification head
        self.backbone.classifier = nn.Sequential(
            nn.Linear(in_features, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.3),
            nn.Linear(256, num_classes)
        )

    def forward(self, x):
        return self.backbone(x)

def run_training_pipeline(dataset_dir: Path = None, epochs_stage1: int = 3, epochs_stage2: int = 2):
    """Executes the complete end-to-end training and evaluation workflow."""
    if dataset_dir is None:
        dataset_dir = config.DATA_DIR / "h2s_calibration_dataset"

    csv_path = dataset_dir / "dataset_metadata.csv"
    if not csv_path.exists():
        print("Metadata not found. Generating calibration dataset first...")
        from ai_pipeline.dataset_generator import build_dataset
        build_dataset(quick_sample=True)

    # Step 1.1 - Load & Validate Dataset
    metadata = pd.read_csv(csv_path)
    print(f"[Phase 1] Dataset loaded: {len(metadata)} images.")
    assert set(metadata['class'].unique()) == {'C0', 'C1', 'C2', 'C3', 'C4'}, "Invalid classes in dataset."

    # Step 1.2 - Verify No Data Leakage (by Physical Strip)
    train_strips = set(metadata[metadata['split'] == 'train']['strip_id'])
    val_strips = set(metadata[metadata['split'] == 'val']['strip_id'])
    test_strips = set(metadata[metadata['split'] == 'test']['strip_id'])

    assert len(train_strips & val_strips) == 0, "Data leakage: strip in train AND val"
    assert len(train_strips & test_strips) == 0, "Data leakage: strip in train AND test"
    assert len(val_strips & test_strips) == 0, "Data leakage: strip in val AND test"
    print("[Phase 1] [OK] Zero data leakage verified across physical strips.")

    # Step 1.3 - Controlled Augmentations (Section 3.3, Page 9)
    train_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomRotation(degrees=5),
        transforms.RandomResizedCrop(224, scale=(0.9, 1.1)),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    val_test_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    train_df = metadata[metadata['split'] == 'train']
    val_df = metadata[metadata['split'] == 'val']
    test_df = metadata[metadata['split'] == 'test']

    train_loader = DataLoader(H2SStripDataset(train_df, train_transforms), batch_size=16, shuffle=True)
    val_loader = DataLoader(H2SStripDataset(val_df, val_test_transforms), batch_size=16, shuffle=False)
    test_loader = DataLoader(H2SStripDataset(test_df, val_test_transforms), batch_size=16, shuffle=False)

    print(f"[OK] Datasets loaded: Train={len(train_df)}, Val={len(val_df)}, Test={len(test_df)}")

    # Phase 2: Model Definition (Pages 16-17)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = H2SMobileNetV3(num_classes=5).to(device)

    # Phase 3: Stage 1 Training - Frozen Backbone
    print("\n[Phase 3] Stage 1 Training: Classification Head only (Backbone frozen)...")
    for param in model.backbone.features.parameters():
        param.requires_grad = False

    criterion = nn.CrossEntropyLoss()
    optimizer_stage1 = optim.Adam(model.backbone.classifier.parameters(), lr=1e-3)

    for epoch in range(epochs_stage1):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer_stage1.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer_stage1.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

        train_acc = correct / max(1, total)
        print(f"  Stage 1 - Epoch {epoch+1}/{epochs_stage1} - Loss: {running_loss/total:.4f}, Acc: {train_acc:.4f}")

    # Phase 4: Stage 2 Training - Fine-tune Top Layers (Pages 17-18)
    print("\n[Phase 4] Stage 2 Training: Fine-tuning top layers...")
    for param in model.backbone.features.parameters():
        param.requires_grad = True

    optimizer_stage2 = optim.Adam(model.parameters(), lr=1e-5)
    for epoch in range(epochs_stage2):
        model.train()
        running_loss = 0.0
        correct = 0
        total = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer_stage2.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer_stage2.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

        train_acc = correct / max(1, total)
        print(f"  Stage 2 - Epoch {epoch+1}/{epochs_stage2} - Loss: {running_loss/total:.4f}, Acc: {train_acc:.4f}")

    # Phase 5: Evaluation on Test Set (Pages 18-20)
    print("\n[Phase 5] Evaluating on Test Set...")
    model.eval()
    y_true = []
    y_pred = []
    with torch.no_grad():
        for images, labels in test_loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            _, preds = torch.max(outputs, 1)
            y_true.extend(labels.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    test_accuracy = float(np.mean(y_true == y_pred))
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3, 4])
    class_names = ['C0', 'C1', 'C2', 'C3', 'C4']

    print(f"[OK] Test Accuracy: {test_accuracy:.4f}")
    print("\nConfusion Matrix:")
    print(cm)
    print("\nClassification Report:")
    report = classification_report(y_true, y_pred, target_names=class_names, output_dict=True, zero_division=0)
    print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

    # Save Confusion Matrix Heatmap (Step 5.2, Page 19)
    plt.figure(figsize=(7, 5))
    plt.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    plt.title('Confusion Matrix - H2S Classification')
    plt.colorbar()
    tick_marks = np.arange(len(class_names))
    plt.xticks(tick_marks, class_names)
    plt.yticks(tick_marks, class_names)

    thresh = cm.max() / 2.
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            plt.text(j, i, format(cm[i, j], 'd'),
                     horizontalalignment="center",
                     color="white" if cm[i, j] > thresh else "black")

    plt.ylabel('True Class')
    plt.xlabel('Predicted Class')
    plt.tight_layout()
    cm_plot_path = config.MODEL_DIR / "confusion_matrix.png"
    plt.savefig(cm_plot_path, dpi=200)
    plt.close()
    print(f"[OK] Confusion matrix plot saved to {cm_plot_path}")

    # Step 5.3 - Comprehensive Metrics Report (Pages 19-20)
    metrics_report = {
        "model_info": {
            "architecture": "MobileNetV3-Small + Classification Head",
            "input_shape": [1, 224, 224, 3],
            "total_parameters": sum(p.numel() for p in model.parameters()),
            "training_date": datetime.utcnow().isoformat(),
            "framework": "PyTorch/Torchvision"
        },
        "dataset_info": {
            "total_images": len(metadata),
            "train_images": len(train_df),
            "val_images": len(val_df),
            "test_images": len(test_df),
            "total_strips": len(metadata['strip_id'].unique()),
            "classes": ["C0 (0-1ppm)", "C1 (1-10ppm)", "C2 (10-50ppm)", "C3 (50-100ppm)", "C4 (>100ppm)"]
        },
        "performance": {
            "test_accuracy": test_accuracy,
            "confusion_matrix": cm.tolist(),
            "per_class_metrics": report
        },
        "hyperparameters": {
            "optimizer": "Adam",
            "learning_rate_stage1": 0.001,
            "learning_rate_stage2": 0.00001,
            "batch_size": 16,
            "dropout": 0.3
        }
    }

    report_path = config.MODEL_DIR / "training_metrics_report.json"
    with open(report_path, "w") as f:
        json.dump(metrics_report, f, indent=2)
    print(f"[OK] Metrics report saved to {report_path}")

    # Phase 6: Model Export & Metadata (Pages 21-22)
    export_version = "v1.1"
    v_dir = config.MODEL_DIR / export_version
    v_dir.mkdir(parents=True, exist_ok=True)

    weights_file = v_dir / f"h2s_model_{export_version}.pt"
    torch.save(model.state_dict(), weights_file)

    model_metadata = {
        "model_version": export_version,
        "model_name": "H2S_MobileNetV3_Classification",
        "model_file": str(weights_file.relative_to(config.BASE_DIR)),
        "input_shape": [1, 224, 224, 3],
        "class_mapping": {
            "0": {"name": "C0", "label": "No/Negligible", "ppm_range": "0-1"},
            "1": {"name": "C1", "label": "Low", "ppm_range": "1-10"},
            "2": {"name": "C2", "label": "Medium", "ppm_range": "10-50"},
            "3": {"name": "C3", "label": "High", "ppm_range": "50-100"},
            "4": {"name": "C4", "label": "Critical", "ppm_range": ">100"}
        },
        "test_accuracy": test_accuracy,
        "deployed": False,
        "approval_status": "Pending Review (Candidate)"
    }

    with open(v_dir / f"h2s_model_{export_version}_metadata.json", "w") as f:
        json.dump(model_metadata, f, indent=2)
    print(f"[OK] Model metadata saved to {v_dir}")

    return test_accuracy, cm

if __name__ == "__main__":
    run_training_pipeline(epochs_stage1=1, epochs_stage2=1)
