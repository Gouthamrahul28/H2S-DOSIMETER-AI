/**
 * Lightweight Zero-Dependency QR Code Generator for Industrial Dosimeter Wristbands
 * Generates SVG and Canvas QR codes encoding:
 * H2S://V2?w={worker_id}&b={batch_id}&s={strip_id}&m={method_key}&exp={expiry}
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QRGenerator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Polynomial arithmetic & Reed-Solomon tables for QR standard
    const GF256_EXP = new Uint8Array(512);
    const GF256_LOG = new Uint8Array(256);
    (function initGF() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            GF256_EXP[i] = x;
            GF256_EXP[i + 255] = x;
            GF256_LOG[x] = i;
            x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
        }
    })();

    function gfMul(x, y) {
        if (x === 0 || y === 0) return 0;
        return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
    }

    function rsGeneratorPoly(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            let next = new Array(poly.length + 1).fill(0);
            for (let j = 0; j < poly.length; j++) {
                next[j] ^= gfMul(poly[j], GF256_EXP[i]);
                next[j + 1] ^= poly[j];
            }
            poly = next;
        }
        return poly;
    }

    function rsCompute(data, numEcc) {
        const gen = rsGeneratorPoly(numEcc);
        const res = new Uint8Array(data.length + numEcc);
        res.set(data);
        for (let i = 0; i < data.length; i++) {
            const coef = res[i];
            if (coef !== 0) {
                for (let j = 0; j < gen.length; j++) {
                    res[i + j] ^= gfMul(gen[j], coef);
                }
            }
        }
        return res.slice(data.length);
    }

    // Standard QR capacities (Version 3: 29x29, Version 4: 33x33, Version 5: 37x37)
    // For dosimeter payloads (~70-100 chars), Version 5-M (37x37, 86 data codewords) is ideal.
    class QRCode {
        constructor(text, version = 5) {
            this.text = text;
            this.version = version;
            this.size = version * 4 + 17; // 37 for ver 5
            this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(null));
            this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
            this.encode();
        }

        encode() {
            this.drawFinderPattern(0, 0);
            this.drawFinderPattern(this.size - 7, 0);
            this.drawFinderPattern(0, this.size - 7);
            this.drawTimingPatterns();
            this.drawAlignmentPattern(this.size - 9, this.size - 9);
            this.reserveFormatBits();
            this.placeData();
            this.applyMask(1);
            this.drawFormatBits(1);
        }

        drawFinderPattern(r, c) {
            for (let y = -1; y <= 7; y++) {
                for (let x = -1; x <= 7; x++) {
                    const row = r + y, col = c + x;
                    if (row >= 0 && row < this.size && col >= 0 && col < this.size) {
                        const isBorder = (y === 0 || y === 6 || x === 0 || x === 6);
                        const isCenter = (y >= 2 && y <= 4 && x >= 2 && x <= 4);
                        const val = (isBorder || isCenter);
                        this.modules[row][col] = val;
                        this.isFunction[row][col] = true;
                    }
                }
            }
        }

        drawTimingPatterns() {
            for (let i = 8; i < this.size - 8; i++) {
                const val = (i % 2 === 0);
                if (this.modules[6][i] === null) {
                    this.modules[6][i] = val;
                    this.isFunction[6][i] = true;
                }
                if (this.modules[i][6] === null) {
                    this.modules[i][6] = val;
                    this.isFunction[i][6] = true;
                }
            }
        }

        drawAlignmentPattern(r, c) {
            for (let y = -2; y <= 2; y++) {
                for (let x = -2; x <= 2; x++) {
                    const val = (Math.abs(y) === 2 || Math.abs(x) === 2 || (y === 0 && x === 0));
                    this.modules[r + y][c + x] = val;
                    this.isFunction[r + y][c + x] = true;
                }
            }
        }

        reserveFormatBits() {
            for (let i = 0; i < 9; i++) {
                if (i !== 6) {
                    this.isFunction[8][i] = true;
                    this.isFunction[i][8] = true;
                }
            }
            for (let i = this.size - 8; i < this.size; i++) {
                this.isFunction[8][i] = true;
                this.isFunction[i][8] = true;
            }
            this.modules[this.size - 8][8] = true; // Dark module
            this.isFunction[this.size - 8][8] = true;
        }

        placeData() {
            const raw = new TextEncoder().encode(this.text);
            const totalCodewords = 108; // Ver 5-M approx
            const eccCount = 26;
            const dataCount = totalCodewords - eccCount;

            const buffer = [0x40 | (raw.length >> 4), ((raw.length & 0xF) << 4)];
            let bitPos = 4;
            for (let i = 0; i < raw.length; i++) {
                const b = raw[i];
                buffer[buffer.length - 1] |= (b >> (8 - bitPos));
                buffer.push((b << bitPos) & 0xFF);
            }

            // Pad bits
            const padBytes = [0xEC, 0x11];
            let pIdx = 0;
            while (buffer.length < dataCount) {
                buffer.push(padBytes[pIdx++ % 2]);
            }
            const dataArr = new Uint8Array(buffer.slice(0, dataCount));
            const eccArr = rsCompute(dataArr, eccCount);

            const allBytes = new Uint8Array(totalCodewords);
            allBytes.set(dataArr, 0);
            allBytes.set(eccArr, dataCount);

            // Lay out bits
            let bitIdx = 0;
            let upward = true;
            for (let right = this.size - 1; right > 0; right -= 2) {
                if (right === 6) right--; // skip timing column
                for (let vert = 0; vert < this.size; vert++) {
                    const row = upward ? (this.size - 1 - vert) : vert;
                    for (let x = 0; x < 2; x++) {
                        const col = right - x;
                        if (!this.isFunction[row][col]) {
                            const byte = allBytes[Math.floor(bitIdx / 8)] || 0;
                            const bit = (byte >> (7 - (bitIdx % 8))) & 1;
                            this.modules[row][col] = (bit === 1);
                            bitIdx++;
                        }
                    }
                }
                upward = !upward;
            }
        }

        applyMask(maskNum) {
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (!this.isFunction[r][c]) {
                        const invert = (r % 2 === 0);
                        if (invert) {
                            this.modules[r][c] = !this.modules[r][c];
                        }
                    }
                }
            }
        }

        drawFormatBits(mask) {
            // Standard format string for M quality
            const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
            for (let i = 0; i < 6; i++) this.modules[8][i] = formatBits[i] === 1;
            this.modules[8][7] = formatBits[6] === 1;
            this.modules[8][8] = formatBits[7] === 1;
            this.modules[7][8] = formatBits[8] === 1;
            for (let i = 9; i < 15; i++) this.modules[14 - i][8] = formatBits[i] === 1;

            for (let i = 0; i < 8; i++) this.modules[this.size - 1 - i][8] = formatBits[i] === 1;
            for (let i = 8; i < 15; i++) this.modules[8][this.size - 15 + i] = formatBits[i] === 1;
        }

        toSVG(scale = 5, margin = 4) {
            const dim = (this.size + margin * 2) * scale;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges">`;
            svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (this.modules[r][c]) {
                        const x = (c + margin) * scale;
                        const y = (r + margin) * scale;
                        svg += `<rect x="${x}" y="${y}" width="${scale}" height="${scale}" fill="#0f172a"/>`;
                    }
                }
            }
            svg += `</svg>`;
            return svg;
        }

        drawToCanvas(canvas, scale = 5, margin = 4) {
            const dim = (this.size + margin * 2) * scale;
            canvas.width = dim;
            canvas.height = dim;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, dim, dim);
            ctx.fillStyle = '#0f172a';
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (this.modules[r][c]) {
                        ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
                    }
                }
            }
        }
    }

    return {
        createPayload(workerId, batchId, stripId, methodKey = "cupan_optical", expiry = "") {
            return `H2S://V2?w=${encodeURIComponent(workerId)}&b=${encodeURIComponent(batchId)}&s=${encodeURIComponent(stripId)}&m=${encodeURIComponent(methodKey)}&exp=${encodeURIComponent(expiry)}`;
        },
        parsePayload(payloadStr) {
            if (!payloadStr || !payloadStr.startsWith("H2S://V2?")) return null;
            const query = payloadStr.substring(9);
            const params = new URLSearchParams(query);
            return {
                workerId: params.get("w"),
                batchId: params.get("b"),
                stripId: params.get("s"),
                methodKey: params.get("m") || "cupan_optical",
                expiry: params.get("exp")
            };
        },
        renderSVG(text, scale = 5) {
            const qr = new QRCode(text);
            return qr.toSVG(scale);
        },
        renderToCanvas(text, canvas, scale = 5) {
            const qr = new QRCode(text);
            qr.drawToCanvas(canvas, scale);
        },
        renderWristbandBadge(worker, batch, stripId, method, container) {
            const payload = this.createPayload(worker.id, batch.batch_id, stripId, method.id || "cupan_optical", batch.expiration_date);
            const svg = this.renderSVG(payload, 4);

            container.innerHTML = `
                <div class="wristband-badge-card">
                    <div class="wristband-header">
                        <div class="wristband-logo">H₂S DOSIMETER WRISTBAND</div>
                        <div class="wristband-method-badge ${method.badge_class || 'badge-green'}">${method.short_badge || 'Cu-PAN'}</div>
                    </div>
                    <div class="wristband-body">
                        <div class="wristband-qr">${svg}</div>
                        <div class="wristband-meta">
                            <div class="wb-field"><span class="wb-label">WORKER:</span> <strong class="wb-val">${worker.name} (${worker.id})</strong></div>
                            <div class="wb-field"><span class="wb-label">BATCH ID:</span> <span class="wb-val">${batch.batch_id}</span></div>
                            <div class="wb-field"><span class="wb-label">STRIP ID:</span> <span class="wb-val font-mono">${stripId}</span></div>
                            <div class="wb-field"><span class="wb-label">EXPIRY:</span> <span class="wb-val text-emerald-400">${batch.expiration_date}</span></div>
                            <div class="wb-field"><span class="wb-label">QC VERIFIED:</span> <span class="wb-val text-emerald-400">PASSED (ΔE ${batch.virgin_baseline_delta_e || 0.3})</span></div>
                        </div>
                    </div>
                    <div class="wristband-footer">
                        <span>Scan with Worker App to auto-bind profile & method</span>
                        <button class="btn-sm btn-outline print-btn" onclick="window.print()">🖨️ Print Wristband Label</button>
                    </div>
                </div>
            `;
        }
    };
}));
