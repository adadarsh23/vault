(function() {
	function e(e, t) {
		let a = "";
		for (let i = 1; i <= t; i++) a += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(e / Math.pow(83, t - i)) % 83];
		return a;
	}
	function t(e) {
		const t = e / 255;
		return t <= .04045 ? t / 12.92 : Math.pow((t + .055) / 1.055, 2.4);
	}
	function a(e, t) {
		return Math.sign(e) * Math.pow(Math.abs(e), t);
	}
	self.onmessage = async (i) => {
		const { id: r, type: o, fileBuffer: n, mimeType: d, targetSize: s = 400, quality: c = .78 } = i.data;
		if ("PROCESS_IMAGE" === o) try {
			const i = function(e, t) {
				const a = new Uint8Array(e.slice(0, 32));
				if (255 === a[0] && 216 === a[1] && 255 === a[2]) return {
					valid: !0,
					detectedFormat: "image/jpeg"
				};
				if (137 === a[0] && 80 === a[1] && 78 === a[2] && 71 === a[3] && 13 === a[4] && 10 === a[5] && 26 === a[6] && 10 === a[7]) return {
					valid: !0,
					detectedFormat: "image/png"
				};
				if (71 === a[0] && 73 === a[1] && 70 === a[2] && 56 === a[3] && (55 === a[4] || 57 === a[4]) && 97 === a[5]) return {
					valid: !0,
					detectedFormat: "image/gif"
				};
				if (66 === a[0] && 77 === a[1]) return {
					valid: !0,
					detectedFormat: "image/bmp"
				};
				if (82 === a[0] && 73 === a[1] && 70 === a[2] && 70 === a[3] && 87 === a[8] && 69 === a[9] && 66 === a[10] && 80 === a[11]) return {
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
				if (102 === a[4] && 116 === a[5] && 121 === a[6] && 112 === a[7]) {
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
				if (0 === a[0] && 0 === a[1] && 0 === a[2] && 12 === a[3] && 106 === a[4] && 80 === a[5] || 255 === a[0] && 79 === a[1] && 255 === a[2] && 81 === a[3]) return {
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
				const i = new TextDecoder("utf-8").decode(e.slice(0, 1024)).trim();
				return i.toLowerCase().includes("<svg") || i.toLowerCase().startsWith("<?xml") ? {
					valid: !0,
					detectedFormat: "image/svg+xml"
				} : t.startsWith("image/") ? {
					valid: !0,
					detectedFormat: t
				} : {
					valid: !1,
					detectedFormat: "unknown"
				};
			}(n, d);
			if (!i.valid) {
				const e = {
					id: r,
					ok: !1,
					error: `Invalid image signature or unsupported format (${i.detectedFormat}).`
				};
				self.postMessage(e);
				return;
			}
			let o, m;
			if ("image/svg+xml" === i.detectedFormat) {
				const e = new TextDecoder("utf-8").decode(n).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/on\w+\s*=\s*(['"]).*?\1/gi, "").replace(/javascript:/gi, "forbidden:");
				o = new Blob([e], { type: "image/svg+xml" });
			} else o = new Blob([n], { type: i.detectedFormat });
			try {
				m = await createImageBitmap(o);
			} catch (l) {
				const e = {
					id: r,
					ok: !1,
					error: `Failed to decode image bitmap: ${l.message}`
				};
				self.postMessage(e);
				return;
			}
			const { width: f, height: h } = m, g = f * h;
			if (f > 4096 || h > 4096 || g > 25e6) {
				m.close();
				const e = {
					id: r,
					ok: !1,
					error: `Security Exception: Image dimensions (${f}x${h} = ${(g / 1e6).toFixed(1)}MP) exceed security thresholds (Max 4096x4096px or 25MP). Processing aborted to prevent browser memory spike.`
				};
				self.postMessage(e);
				return;
			}
			const u = Math.min(f, h), v = (f - u) / 2, M = (h - u) / 2, p = Math.min(s, u);
			let w = new OffscreenCanvas(p, p), x = w.getContext("2d", { willReadFrequently: !0 });
			if (!x) throw m.close(), /* @__PURE__ */ new Error("Failed to obtain OffscreenCanvas 2D context.");
			x.imageSmoothingEnabled = !0, x.imageSmoothingQuality = "high", x.drawImage(m, v, M, u, u, 0, 0, p, p), m.close();
			let F = "L00000fQ00fQ00fQ00fQ";
			try {
				let i = new OffscreenCanvas(32, 32), r = i.getContext("2d", { willReadFrequently: !0 });
				r && (r.drawImage(w, 0, 0, 32, 32), F = function(i, r = 4, o = 3) {
					const { width: n, height: d, data: s } = i, c = n * d, l = [];
					for (let e = 0; e < o; e++) for (let a = 0; a < r; a++) {
						let i = 0, r = 0, o = 0;
						const m = 0 === a && 0 === e ? 1 : 2;
						for (let l = 0; l < c; l++) {
							const c = l % n, m = Math.floor(l / n), f = Math.cos(Math.PI * a * c / n) * Math.cos(Math.PI * e * m / d), h = 4 * l;
							i += f * t(s[h]), r += f * t(s[h + 1]), o += f * t(s[h + 2]);
						}
						const f = m / c;
						l.push([
							i * f,
							r * f,
							o * f
						]);
					}
					const m = l[0], f = l.slice(1);
					let h = "";
					h += e(r - 1 + 9 * (o - 1), 1);
					let g = 0;
					if (f.length > 0) {
						for (const e of f) g = Math.max(g, Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2]));
						h += e(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * g - .5)))), 1);
					} else h += e(0, 1);
					const u = (e) => {
						const t = function(e) {
							const t = Math.max(0, Math.min(1, e));
							return t <= .0031308 ? Math.round(12.92 * t * 255) : Math.round(255 * (1.055 * Math.pow(t, 1 / 2.4) - .055));
						}(e);
						return 255 & Math.round(t);
					};
					h += e((u(m[0]) << 16) + (u(m[1]) << 8) + u(m[2]), 4);
					const v = 0 === g ? 1 : g;
					for (const t of f) h += e(19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(t[0] / v, .5) + 9.5)))) * 19 + 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(t[1] / v, .5) + 9.5)))) + Math.floor(Math.max(0, Math.min(18, Math.floor(9 * a(t[2] / v, .5) + 9.5)))), 2);
					return h;
				}(r.getImageData(0, 0, 32, 32), 4, 3)), i && (i.width = 0, i.height = 0), i = null, r = null;
			} catch {}
			let y = c, b = null, C = "image/avif";
			try {
				b = await w.convertToBlob({
					type: "image/avif",
					quality: y
				});
			} catch {
				b = null;
			}
			b && 0 !== b.size || (C = "image/webp", b = await w.convertToBlob({
				type: "image/webp",
				quality: y
			}));
			const I = 46080;
			for (; b.size > I && y > .3;) y -= .1, b = await w.convertToBlob({
				type: C,
				quality: y
			});
			w.width = 0, w.height = 0, w = null, x = null;
			const k = await b.arrayBuffer(), B = {
				id: r,
				ok: !0,
				buffer: k,
				width: p,
				height: p,
				mimeType: C,
				blurHash: F,
				fileSize: k.byteLength
			};
			self.postMessage(B, [k]);
		} catch (m) {
			const e = {
				id: r,
				ok: !1,
				error: m instanceof Error ? m.message : "Unknown image processing error"
			};
			self.postMessage(e);
		}
	};
})();

//# sourceMappingURL=ImageProcessorWorker-CGGeisUG.js.map