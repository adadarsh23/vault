(function() {
	function e(e, t) {
		let a = "";
		for (let r = 1; r <= t; r++) a += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(e / Math.pow(83, t - r)) % 83];
		return a;
	}
	const t = /* @__PURE__ */ new Float32Array(256);
	for (let o = 0; o < 256; o++) {
		const e = o / 255;
		t[o] = e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4);
	}
	function a(e) {
		return t[255 & e];
	}
	function r(e, t) {
		return Math.sign(e) * Math.pow(Math.abs(e), t);
	}
	self.onmessage = async (t) => {
		if (!t.data || "object" != typeof t.data) return;
		const { id: o, type: i, fileBuffer: n, mimeType: s, targetSize: l = 400, quality: d = .78 } = t.data;
		if ("PROCESS_IMAGE" !== i) return;
		let c = null, f = null, m = null, h = null, u = null;
		try {
			if (!(n && n instanceof ArrayBuffer && 0 !== n.byteLength)) throw new Error("Image fileBuffer is invalid or empty.");
			const t = function(e, t) {
				if (!e || e.byteLength < 4) return {
					valid: !1,
					detectedFormat: "empty-or-truncated"
				};
				const a = new Uint8Array(e, 0, Math.min(32, e.byteLength));
				if (255 === a[0] && 216 === a[1] && 255 === a[2]) return {
					valid: !0,
					detectedFormat: "image/jpeg"
				};
				if (a.length >= 8 && 137 === a[0] && 80 === a[1] && 78 === a[2] && 71 === a[3] && 13 === a[4] && 10 === a[5] && 26 === a[6] && 10 === a[7]) return {
					valid: !0,
					detectedFormat: "image/png"
				};
				if (a.length >= 6 && 71 === a[0] && 73 === a[1] && 70 === a[2] && 56 === a[3] && (55 === a[4] || 57 === a[4]) && 97 === a[5]) return {
					valid: !0,
					detectedFormat: "image/gif"
				};
				if (a.length >= 2 && 66 === a[0] && 77 === a[1]) return {
					valid: !0,
					detectedFormat: "image/bmp"
				};
				if (a.length >= 12 && 82 === a[0] && 73 === a[1] && 70 === a[2] && 70 === a[3] && 87 === a[8] && 69 === a[9] && 66 === a[10] && 80 === a[11]) return {
					valid: !0,
					detectedFormat: "image/webp"
				};
				if (73 === a[0] && 73 === a[1] && 42 === a[2] && 0 === a[3] || 77 === a[0] && 77 === a[1] && 0 === a[2] && 42 === a[3]) return {
					valid: !0,
					detectedFormat: "image/tiff"
				};
				if (70 === a[0] && 85 === a[1] && 74 === a[2] && 73 === a[3]) return {
					valid: !0,
					detectedFormat: "image/x-fuji-raf"
				};
				if (a.length >= 12 && 102 === a[4] && 116 === a[5] && 121 === a[6] && 112 === a[7]) {
					const e = String.fromCharCode(...a.slice(8, 12)).toLowerCase();
					return ["avif", "avis"].some((t) => e.startsWith(t)) ? {
						valid: !0,
						detectedFormat: "image/avif"
					} : [
						"heic",
						"heix",
						"hevc",
						"hevx",
						"heif",
						"mif1",
						"msf1"
					].some((t) => e.startsWith(t)) ? {
						valid: !0,
						detectedFormat: "image/heic"
					} : {
						valid: !0,
						detectedFormat: "image/heif"
					};
				}
				if (0 === a[0] && 0 === a[1] && (1 === a[2] || 2 === a[2]) && 0 === a[3]) return {
					valid: !0,
					detectedFormat: "image/x-icon"
				};
				if (56 === a[0] && 66 === a[1] && 80 === a[2] && 83 === a[3]) return {
					valid: !0,
					detectedFormat: "image/vnd.adobe.photoshop"
				};
				if (a.length >= 6 && 0 === a[0] && 0 === a[1] && 0 === a[2] && 12 === a[3] && 106 === a[4] && 80 === a[5] || 255 === a[0] && 79 === a[1] && 255 === a[2] && 81 === a[3]) return {
					valid: !0,
					detectedFormat: "image/jp2"
				};
				if (73 === a[0] && 73 === a[1] && 188 === a[2]) return {
					valid: !0,
					detectedFormat: "image/jxr"
				};
				if (68 === a[0] && 68 === a[1] && 83 === a[2] && 32 === a[3]) return {
					valid: !0,
					detectedFormat: "image/vnd-ms.dds"
				};
				if (118 === a[0] && 47 === a[1] && 49 === a[2] && 1 === a[3]) return {
					valid: !0,
					detectedFormat: "image/x-exr"
				};
				if (35 === a[0] && 63 === a[1] && (82 === a[2] || 114 === a[2])) return {
					valid: !0,
					detectedFormat: "image/vnd.radiance"
				};
				if (105 === a[0] && 99 === a[1] && 110 === a[2] && 115 === a[3]) return {
					valid: !0,
					detectedFormat: "image/x-icns"
				};
				if (31 === a[0] && 139 === a[1]) return {
					valid: !0,
					detectedFormat: "image/svg+xml"
				};
				try {
					const t = new TextDecoder("utf-8").decode(new Uint8Array(e, 0, Math.min(1024, e.byteLength))).trim();
					if (t.toLowerCase().includes("<svg") || t.toLowerCase().startsWith("<?xml")) return {
						valid: !0,
						detectedFormat: "image/svg+xml"
					};
				} catch {}
				return t && t.startsWith("image/") ? {
					valid: !0,
					detectedFormat: t
				} : {
					valid: !1,
					detectedFormat: "unknown"
				};
			}(n, s);
			if (!t.valid) {
				const e = {
					id: o,
					ok: !1,
					error: `Invalid image signature or unsupported format (${t.detectedFormat}).`
				};
				self.postMessage(e);
				return;
			}
			let i;
			if ("image/svg+xml" === t.detectedFormat) {
				const e = new TextDecoder("utf-8").decode(n).replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!ENTITY[\s\S]*?>/gi, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/on\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript:/gi, "forbidden:");
				i = new Blob([e], { type: "image/svg+xml" });
			} else i = new Blob([n], { type: t.detectedFormat });
			try {
				c = await createImageBitmap(i);
			} catch (g) {
				const e = {
					id: o,
					ok: !1,
					error: `Failed to decode image bitmap: ${g.message}`
				};
				self.postMessage(e);
				return;
			}
			const { width: p, height: M } = c, v = p * M;
			if (p <= 0 || M <= 0 || p > 4096 || M > 4096 || v > 25e6) {
				c.close(), c = null;
				const e = {
					id: o,
					ok: !1,
					error: `Security Exception: Image dimensions (${p}x${M} = ${(v / 1e6).toFixed(1)}MP) exceed security thresholds (Max 4096x4096px or 25MP). Processing aborted to prevent browser memory spike.`
				};
				self.postMessage(e);
				return;
			}
			const w = Math.max(16, Math.min(2048, Number.isFinite(l) ? Math.round(l) : 400)), y = Math.min(p, M), F = (p - y) / 2, b = (M - y) / 2, x = Math.min(w, y);
			if (f = new OffscreenCanvas(x, x), m = f.getContext("2d", { willReadFrequently: !0 }), !m) throw new Error("Failed to obtain OffscreenCanvas 2D context.");
			m.imageSmoothingEnabled = !0, m.imageSmoothingQuality = "high", m.drawImage(c, F, b, y, y, 0, 0, x, x), c.close(), c = null;
			let k = "L00000fQ00fQ00fQ00fQ";
			try {
				h = new OffscreenCanvas(32, 32), u = h.getContext("2d", { willReadFrequently: !0 }), u && (u.drawImage(f, 0, 0, 32, 32), k = function(t, o = 4, i = 3) {
					const { width: n, height: s, data: l } = t, d = n * s;
					if (0 === d) return "L00000fQ00fQ00fQ00fQ";
					const c = new Float32Array(d), f = new Float32Array(d), m = new Float32Array(d);
					for (let e = 0; e < d; e++) {
						const t = 4 * e;
						c[e] = a(l[t]), f[e] = a(l[t + 1]), m[e] = a(l[t + 2]);
					}
					const h = [];
					for (let e = 0; e < o; e++) {
						const t = new Float64Array(n);
						for (let a = 0; a < n; a++) t[a] = Math.cos(Math.PI * e * a / n);
						h.push(t);
					}
					const u = [];
					for (let e = 0; e < i; e++) {
						const t = new Float64Array(s);
						for (let a = 0; a < s; a++) t[a] = Math.cos(Math.PI * e * a / s);
						u.push(t);
					}
					const g = [];
					for (let e = 0; e < i; e++) {
						const t = u[e];
						for (let a = 0; a < o; a++) {
							const r = h[a];
							let o = 0, i = 0, l = 0;
							const u = 0 === a && 0 === e ? 1 : 2;
							let p = 0;
							for (let e = 0; e < s; e++) {
								const a = t[e];
								for (let e = 0; e < n; e++) {
									const t = r[e] * a;
									o += t * c[p], i += t * f[p], l += t * m[p], p++;
								}
							}
							const M = u / d;
							g.push([
								o * M,
								i * M,
								l * M
							]);
						}
					}
					const p = g[0], M = g.slice(1);
					let v = "";
					v += e(o - 1 + 9 * (i - 1), 1);
					let w = 0;
					if (M.length > 0) {
						for (const e of M) w = Math.max(w, Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2]));
						v += e(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * w - .5)))), 1);
					} else v += e(0, 1);
					const y = (e) => {
						const t = function(e) {
							const t = Math.max(0, Math.min(1, e));
							return t <= .0031308 ? Math.round(12.92 * t * 255) : Math.round(255 * (1.055 * Math.pow(t, 1 / 2.4) - .055));
						}(e);
						return 255 & Math.round(t);
					};
					v += e((y(p[0]) << 16) + (y(p[1]) << 8) + y(p[2]), 4);
					const F = 0 === w ? 1 : w;
					for (const a of M) v += e(19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * r(a[0] / F, .5) + 9.5)))) * 19 + 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * r(a[1] / F, .5) + 9.5)))) + Math.floor(Math.max(0, Math.min(18, Math.floor(9 * r(a[2] / F, .5) + 9.5)))), 2);
					return v;
				}(u.getImageData(0, 0, 32, 32), 4, 3));
			} catch {} finally {
				h && (h.width = 0, h.height = 0, h = null), u = null;
			}
			let E = Math.max(.1, Math.min(1, Number.isFinite(d) ? d : .78)), L = null, C = "image/avif";
			try {
				L = await f.convertToBlob({
					type: "image/avif",
					quality: E
				});
			} catch {
				L = null;
			}
			L && 0 !== L.size || (C = "image/webp", L = await f.convertToBlob({
				type: "image/webp",
				quality: E
			}));
			const I = 46080;
			let A = 0;
			for (; L && L.size > I && E > .3 && A < 5;) {
				A++, E = Math.round(100 * (E - .1)) / 100;
				const e = await f.convertToBlob({
					type: C,
					quality: E
				});
				if (!(e && e.size > 0)) break;
				L = e;
			}
			if (!L || 0 === L.size) throw new Error("Failed to encode output image blob.");
			f.width = 0, f.height = 0, f = null, m = null;
			const B = await L.arrayBuffer(), S = {
				id: o,
				ok: !0,
				buffer: B,
				width: x,
				height: x,
				mimeType: C,
				blurHash: k,
				fileSize: B.byteLength
			};
			self.postMessage(S, [B]);
		} catch (p) {
			const e = {
				id: o,
				ok: !1,
				error: p instanceof Error ? p.message : "Unknown image processing error"
			};
			self.postMessage(e);
		} finally {
			c && (c.close(), c = null), f && (f.width = 0, f.height = 0, f = null), m = null, h && (h.width = 0, h.height = 0, h = null), u = null;
		}
	}, "undefined" != typeof self && "function" == typeof self.addEventListener && (self.addEventListener("error", (e) => {
		const t = e;
		self.postMessage({
			id: "unknown",
			ok: !1,
			error: t.message || "Image processor worker unexpected runtime error"
		});
	}), self.addEventListener("unhandledrejection", (e) => {
		const t = e;
		self.postMessage({
			id: "unknown",
			ok: !1,
			error: t.reason?.message || "Unhandled promise rejection in image processor worker"
		});
	}));
})();

//# sourceMappingURL=ImageProcessorWorker-CmsJM19W.js.map