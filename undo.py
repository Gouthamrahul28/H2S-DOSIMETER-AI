"""
H2S Industrial Safety Platform - Undo & Version Management Utility
Enables complete version tracking and 1-command UNDO for Git, AI Models, and Safety Configurations.
"""

import argparse
import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).resolve().parent

def run_git_cmd(args):
    """Run a git command in the repository directory and return output."""
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            check=True
        )
        return res.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Git command failed: {e.stderr.strip()}", file=sys.stderr)
        return None
    except Exception as ex:
        print(f"Execution error: {ex}", file=sys.stderr)
        return None

def show_git_history(limit=10):
    """Display git commit history with tags and status."""
    print("=" * 60)
    print("           GIT VERSION HISTORY & CHECKPOINTS")
    print("=" * 60)
    out = run_git_cmd(["log", f"-n{limit}", "--pretty=format:%h | %ad | %d %s", "--date=short"])
    if out:
        print(out)
    else:
        print("No git commits found yet.")
    print("-" * 60)
    
    # Status
    status = run_git_cmd(["status", "--short"])
    if status:
        print("Uncommitted changes:")
        print(status)
    else:
        print("Working tree clean. No uncommitted modifications.")
    print("=" * 60)

def undo_last_changes():
    """Reverts working tree modifications or resets the last commit if requested."""
    status = run_git_cmd(["status", "--short"])
    if status:
        print("Uncommitted changes detected. Discarding uncommitted modifications...")
        run_git_cmd(["checkout", "--", "."])
        run_git_cmd(["clean", "-fd"])
        print("[OK] All uncommitted working tree changes have been undone!")
    else:
        print("Working tree was clean. Undoing the last commit (preserving files)...")
        run_git_cmd(["reset", "--soft", "HEAD~1"])
        print("[OK] Last commit has been undone (staged in working directory).")

def restore_file(filepath: str):
    """Restore a specific file to the latest committed state."""
    print(f"Restoring {filepath} to committed state...")
    out = run_git_cmd(["checkout", "HEAD", "--", filepath])
    if out is not None:
        print(f"[OK] File '{filepath}' successfully restored!")

def create_checkpoint(message: str, tag: str = None):
    """Create a new version checkpoint with git commit and optional tag."""
    run_git_cmd(["add", "-A"])
    commit_msg = f"[Checkpoint] {message} ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
    out = run_git_cmd(["commit", "-m", commit_msg])
    if out:
        print(f"[OK] Checkpoint created: {commit_msg}")
        if tag:
            run_git_cmd(["tag", "-a", tag, "-m", message])
            print(f"[OK] Tag created: {tag}")
    else:
        print("No changes to commit for checkpoint.")

def list_model_versions():
    """List all AI model versions from the model registry."""
    registry_file = ROOT_DIR / "models" / "model_registry.json"
    print("=" * 60)
    print("               AI MODEL REGISTRY VERSIONS")
    print("=" * 60)
    if not registry_file.exists():
        print("No model registry file found yet.")
        return
    with open(registry_file, "r") as f:
        data = json.load(f)
    active = data.get("active_version", "None")
    print(f"Currently Active Model: {active}\n")
    for v_name, meta in data.get("versions", {}).items():
        is_active = " [ACTIVE]" if v_name == active else ""
        print(f"* Version: {v_name}{is_active}")
        print(f"  Name: {meta.get('model_name')}")
        print(f"  Accuracy: {meta.get('test_accuracy', 'N/A')}")
        print(f"  Status: {meta.get('approval_status')}")
        print(f"  Updated: {meta.get('created_at', 'N/A')}")
        print()
    print("=" * 60)

def rollback_model(target_version: str):
    """Roll back active model in model registry."""
    registry_file = ROOT_DIR / "models" / "model_registry.json"
    if not registry_file.exists():
        print("Model registry not found.")
        return
    with open(registry_file, "r") as f:
        data = json.load(f)
    if target_version not in data.get("versions", {}):
        print(f"Error: Version '{target_version}' does not exist in registry.")
        print(f"Available versions: {list(data.get('versions', {}).keys())}")
        return
    old_version = data.get("active_version")
    data["active_version"] = target_version
    data["versions"][target_version]["approval_status"] = "Approved (Active)"
    with open(registry_file, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[OK] AI Model successfully rolled back from {old_version} to {target_version}!")

def main():
    parser = argparse.ArgumentParser(description="H2S Safety Platform - Undo & Version Controller")
    parser.add_argument("--history", action="store_true", help="Show git version history")
    parser.add_argument("--undo", action="store_true", help="Undo last changes or last commit")
    parser.add_argument("--restore", type=str, metavar="FILE", help="Restore specific file from git")
    parser.add_argument("--checkpoint", type=str, metavar="MSG", help="Create a manual git checkpoint")
    parser.add_argument("--tag", type=str, metavar="TAG", help="Tag for the checkpoint")
    parser.add_argument("--models", action="store_true", help="List AI model versions")
    parser.add_argument("--rollback-model", type=str, metavar="VERSION", help="Rollback active model to specified version")

    args = parser.parse_args()

    if args.history:
        show_git_history()
    elif args.undo:
        undo_last_changes()
    elif args.restore:
        restore_file(args.restore)
    elif args.checkpoint:
        create_checkpoint(args.checkpoint, args.tag)
    elif args.models:
        list_model_versions()
    elif args.rollback_model:
        rollback_model(args.rollback_model)
    else:
        show_git_history()

if __name__ == "__main__":
    main()
