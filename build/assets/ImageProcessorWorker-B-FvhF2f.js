(function() {
	function t(t, e) {
		let a = "";
		for (let o = 1; o <= e; o++) a += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(t / Math.pow(83, e - o)) % 83];
		return a;
	}
	function e(t) {
		const e = t / 255;
		return e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4);
	}
	function a(t, e) {
		return Math.sign(t) * Math.pow(Math.abs(t), e);
	}
	self.onmessage = async (o) => {
		const { id: r, type: i, fileBuffer: n, mimeType: s, targetSize: l = 400, quality: c = .78 } = o.data;
		if ("PROCESS_IMAGE" === i) try {
			const o = function(t, e) {
				const a = new Uint8Array(t.slice(0, 16));
				if (255 === a[0] && 216 === a[1] && 255 === a[2]) return {
					valid: !0,
					detectedFormat: "image/jpeg"
				};
				if (137 === a[0] && 80 === a[1] && 78 === a[2] && 71 === a[3] && 13 === a[4] && 10 === a[5] && 26 === a[6] && 10 === a[7]) return {
					valid: !0,
					detectedFormat: "image/png"
				};
				if (82 === a[0] && 73 === a[1] && 70 === a[2] && 70 === a[3] && 87 === a[8] && 69 === a[9] && 66 === a[10] && 80 === a[11]) return {
					valid: !0,
					detectedFormat: "image/webp"
				};
				const o = new TextDecoder("utf-8").decode(t.slice(0, 1024)).trim();
				return o.toLowerCase().includes("<svg") || o.toLowerCase().startsWith("<?xml") ? {
					valid: !0,
					detectedFormat: "image/svg+xml"
				} : e.startsWith("image/") ? {
					valid: !0,
					detectedFormat: e
				} : {
					valid: !1,
					detectedFormat: "unknown"
				};
			}(n, s);
			if (!o.valid) {
				const t = {
					id: r,
					ok: !1,
					error: `Invalid image signature or unsupported format (${o.detectedFormat}).`
				};
				self.postMessage(t);
				return;
			}
			let i, h;
			if ("image/svg+xml" === o.detectedFormat) {
				const t = new TextDecoder("utf-8").decode(n).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/on\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript:/gi, "forbidden:");
				i = new Blob([t], { type: "image/svg+xml" });
			} else i = new Blob([n], { type: o.detectedFormat });
			try {
				h = await createImageBitmap(i);
			} catch (d) {
				const t = {
					id: r,
					ok: !1,
					error: `Failed to decode image bitmap: ${d.message}`
				};
				self.postMessage(t);
				return;
			}
			const { width: f, height: m } = h, g = f * m;
			if (f > 4096 || m > 4096 || g > 25e6) {
				h.close();
				const t = {
					id: r,
					ok: !1,
					error: `Security Exception: Image dimensions (${f}x${m} = ${(g / 1e6).toFixed(1)}MP) exceed security thresholds (Max 4096x4096px or 25MP). Processing aborted to prevent browser memory spike.`
				};
				self.postMessage(t);
				return;
			}
			const u = Math.min(f, m), M = (f - u) / 2, p = (m - u) / 2, w = Math.min(l, u);
			let y = new OffscreenCanvas(w, w), v = y.getContext("2d", { willReadFrequently: !0 });
			if (!v) throw h.close(), /* @__PURE__ */ new Error("Failed to obtain OffscreenCanvas 2D context.");
			v.imageSmoothingEnabled = !0, v.imageSmoothingQuality = "high", v.drawImage(h, M, p, u, u, 0, 0, w, w), h.close();
			let b = "L00000fQ00fQ00fQ00fQ";
			try {
				let o = new OffscreenCanvas(32, 32), r = o.getContext("2d", { willReadFrequently: !0 });
				r && (r.drawImage(y, 0, 0, 32, 32), b = function(o, r = 4, i = 3) {
					const { width: n, height: s, data: l } = o, c = n * s, d = [];
					for (let t = 0; t < i; t++) for (let a = 0; a < r; a++) {
						let o = 0, r = 0, i = 0;
						const h = 0 === a && 0 === t ? 1 : 2;
						for (let d = 0; d < c; d++) {
							const c = d % n, h = Math.floor(d / n), f = Math.cos(Math.PI * a * c / n) * Math.cos(Math.PI * t * h / s), m = 4 * d;
							o += f * e(l[m]), r += f * e(l[m + 1]), i += f * e(l[m + 2]);
						}
						const f = h / c;
						d.push([
							o * f,
							r * f,
							i * f
						]);
					}
					const h = d[0], f = d.slice(1);
					let m = "";
					m += t(r - 1 + 9 * (i - 1), 1);
					let g = 0;
					if (f.length > 0) {
						for (const t of f) g = Math.max(g, Math.abs(t[0]), Math.abs(t[1]), Math.abs(t[2]));
						m += t(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * g - .5)))), 1);
					} else m += t(0, 1);
					const u = (t) => {
						const e = function(t) {
							const e = Math.max(0, Math.min(1, t));
							return e <= .0031308 ? Math.round(12.92 * e * 255) : Math.round(255 * (1.055 * Math.pow(e, 1 / 2.4) - .055));
						}(t);
						return 255 & Math.round(e);
					};
					m += t((u(h[0]) << 16) + (u(h[1]) << 8) + u(h[2]), 4);
					const M = 0 === g ? 1 : g;
					for (const e of f) m += t(19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(e[0] / M, .5) + 9.5)))) * 19 + 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(e[1] / M, .5) + 9.5)))) + Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(e[2] / M, .5) + 9.5)))), 2);
					return m;
				}(r.getImageData(0, 0, 32, 32), 4, 3)), o && (o.width = 0, o.height = 0), o = null, r = null;
			} catch {}
			let x = c, F = null, I = "image/avif";
			try {
				F = await y.convertToBlob({
					type: "image/avif",
					quality: x
				});
			} catch {
				F = null;
			}
			F && 0 !== F.size || (I = "image/webp", F = await y.convertToBlob({
				type: "image/webp",
				quality: x
			}));
			const k = 46080;
			for (; F.size > k && x > .3;) x -= .1, F = await y.convertToBlob({
				type: I,
				quality: x
			});
			y.width = 0, y.height = 0, y = null, v = null;
			const B = await F.arrayBuffer(), C = {
				id: r,
				ok: !0,
				buffer: B,
				width: w,
				height: w,
				mimeType: I,
				blurHash: b,
				fileSize: B.byteLength
			};
			self.postMessage(C, [B]);
		} catch (h) {
			const t = {
				id: r,
				ok: !1,
				error: h instanceof Error ? h.message : "Unknown image processing error"
			};
			self.postMessage(t);
		}
	};
})();

//# sourceMappingURL=ImageProcessorWorker-B-FvhF2f.js.map