(function() {
	function e(e, t) {
		let n = "";
		for (let r = 1; r <= t; r++) n += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(e / Math.pow(83, t - r)) % 83];
		return n;
	}
	const t = /* @__PURE__ */ new Float32Array(256);
	for (let r = 0; r < 256; r++) {
		const e = r / 255;
		t[r] = e <= .04045 ? e / 12.92 : Math.pow((e + .055) / 1.055, 2.4);
	}
	function n(e, t) {
		return Math.sign(e) * Math.pow(Math.abs(e), t);
	}
	self.onmessage = async (r) => {
		if (!r.data || "object" != typeof r.data) return;
		const a = r.data;
		let o = null, i = null, s = null;
		try {
			if (!a.id || !a.type) throw new Error("Invalid worker request: missing id or type");
			if ("STRIP_EXIF" === a.type) {
				const e = function(e, t) {
					if (e && e.byteLength >= 2) {
						const t = new Uint8Array(e, 0, Math.min(12, e.byteLength));
						if (255 === t[0] && 216 === t[1]) return "jpeg";
						if (t.length >= 8 && 137 === t[0] && 80 === t[1] && 78 === t[2] && 71 === t[3]) return "png";
						if (t.length >= 12 && 82 === t[0] && 73 === t[1] && 70 === t[2] && 70 === t[3] && 87 === t[8] && 69 === t[9] && 66 === t[10] && 80 === t[11]) return "webp";
					}
					const n = (t || "").toLowerCase();
					return n.includes("jpeg") || n.includes("jpg") ? "jpeg" : n.includes("png") ? "png" : n.includes("webp") ? "webp" : "other";
				}(a.fileBuffer, a.mimeType);
				if ("jpeg" === e) {
					const e = function(e) {
						if (!e || e.byteLength < 4) return e;
						const t = new DataView(e);
						if (65496 !== t.getUint16(0)) return e;
						const n = [];
						n.push(new Uint8Array(e, 0, 2));
						let r = 2;
						for (; r < t.byteLength;) {
							if (255 !== t.getUint8(r)) {
								n.push(new Uint8Array(e, r));
								break;
							}
							for (; r < t.byteLength && 255 === t.getUint8(r);) r++;
							if (r >= t.byteLength) break;
							const a = 65280 | t.getUint8(r);
							if (r++, 65498 === a) {
								n.push(new Uint8Array(e, r - 2));
								break;
							}
							if (65497 === a) {
								n.push(new Uint8Array(e, r - 2, 2));
								break;
							}
							if (a >= 65488 && a <= 65495) {
								n.push(new Uint8Array(e, r - 2, 2));
								continue;
							}
							if (r + 2 > t.byteLength) return e;
							const o = t.getUint16(r);
							if (o < 2 || r + o > t.byteLength) return e;
							a >= 65505 && a <= 65519 || 65534 === a || n.push(new Uint8Array(e, r - 2, 2 + o)), r += o;
						}
						const a = n.reduce((e, t) => e + t.byteLength, 0), o = new Uint8Array(a);
						let i = 0;
						for (const s of n) o.set(s, i), i += s.byteLength;
						return o.buffer;
					}(a.fileBuffer), t = {
						id: a.id,
						ok: !0,
						type: "STRIP_EXIF",
						cleanedBuffer: e,
						mimeType: "image/jpeg"
					};
					self.postMessage(t, [e]);
					return;
				}
				if ("png" === e) {
					const e = function(e) {
						if (!e || e.byteLength < 8) return e;
						const t = new Uint8Array(e);
						if (137 !== t[0] || 80 !== t[1] || 78 !== t[2] || 71 !== t[3] || 13 !== t[4] || 10 !== t[5] || 26 !== t[6] || 10 !== t[7]) return e;
						const n = [];
						n.push(t.subarray(0, 8));
						const r = /* @__PURE__ */ new Set([
							"eXIf",
							"tEXt",
							"zTXt",
							"iTXt",
							"tIME"
						]);
						let a = 8;
						const o = new DataView(e);
						for (; a + 12 <= t.length;) {
							const i = o.getUint32(a), s = String.fromCharCode(t[a + 4], t[a + 5], t[a + 6], t[a + 7]), f = 12 + i;
							if (a + f > t.length) return e;
							if (r.has(s) || n.push(t.subarray(a, a + f)), a += f, "IEND" === s) break;
						}
						const i = n.reduce((e, t) => e + t.byteLength, 0), s = new Uint8Array(i);
						let f = 0;
						for (const h of n) s.set(h, f), f += h.byteLength;
						return s.buffer;
					}(a.fileBuffer), t = {
						id: a.id,
						ok: !0,
						type: "STRIP_EXIF",
						cleanedBuffer: e,
						mimeType: "image/png"
					};
					self.postMessage(t, [e]);
					return;
				}
				if ("webp" === e) {
					const e = function(e) {
						if (!e || e.byteLength < 12) return e;
						const t = new Uint8Array(e), n = String.fromCharCode(t[0], t[1], t[2], t[3]), r = String.fromCharCode(t[8], t[9], t[10], t[11]);
						if ("RIFF" !== n || "WEBP" !== r) return e;
						const a = new DataView(e), o = [];
						let i = 12;
						for (; i + 8 <= t.length;) {
							const n = String.fromCharCode(t[i], t[i + 1], t[i + 2], t[i + 3]), r = a.getUint32(i + 4, !0), s = 8 + (r + r % 2);
							if (i + 8 + r > t.length) return e;
							if ("EXIF" !== n && "XMP " !== n) {
								let e = t.subarray(i, Math.min(i + s, t.length));
								"VP8X" === n && e.length >= 16 && (e = new Uint8Array(e), e[8] = -9 & e[8], e[8] = -5 & e[8]), o.push(e);
							}
							i += s;
						}
						const s = 12 + o.reduce((e, t) => e + t.byteLength, 0), f = new Uint8Array(s);
						f.set(t.subarray(0, 4), 0), new DataView(f.buffer).setUint32(4, s - 8, !0), f.set(t.subarray(8, 12), 8);
						let h = 12;
						for (const l of o) f.set(l, h), h += l.byteLength;
						return f.buffer;
					}(a.fileBuffer), t = {
						id: a.id,
						ok: !0,
						type: "STRIP_EXIF",
						cleanedBuffer: e,
						mimeType: "image/webp"
					};
					self.postMessage(t, [e]);
					return;
				}
			}
			if ("undefined" == typeof OffscreenCanvas || "undefined" == typeof createImageBitmap) throw new Error("OffscreenCanvas or createImageBitmap is not supported in Web Worker environment");
			if (!(a.fileBuffer && a.fileBuffer instanceof ArrayBuffer && 0 !== a.fileBuffer.byteLength)) throw new Error("fileBuffer is empty or invalid ArrayBuffer");
			const r = new Blob([a.fileBuffer], { type: a.mimeType || "image/jpeg" });
			if (o = await createImageBitmap(r), "GENERATE_THUMBNAIL" === a.type) {
				const e = Math.max(16, a.maxWidth || 300), t = Math.max(16, a.maxHeight || 300);
				let n = o.width, r = o.height;
				if (n > e || r > t) {
					const a = Math.min(e / n, t / r);
					n = Math.max(1, Math.round(n * a)), r = Math.max(1, Math.round(r * a));
				}
				if (i = new OffscreenCanvas(n, r), s = i.getContext("2d"), !s) throw new Error("Could not get 2d canvas context");
				s.imageSmoothingEnabled = !0, s.imageSmoothingQuality = "high", s.drawImage(o, 0, 0, n, r), o.close(), o = null;
				const f = await (await i.convertToBlob({
					type: "image/jpeg",
					quality: .8
				})).arrayBuffer(), h = {
					id: a.id,
					ok: !0,
					type: "GENERATE_THUMBNAIL",
					thumbnailBuffer: f,
					mimeType: "image/jpeg"
				};
				self.postMessage(h, [f]);
				return;
			}
			if ("GENERATE_BLURHASH" === a.type) {
				const r = 32, f = 32;
				if (i = new OffscreenCanvas(r, f), s = i.getContext("2d", { willReadFrequently: !0 }), !s) throw new Error("Could not get 2d canvas context");
				s.drawImage(o, 0, 0, r, f);
				const h = s.getImageData(0, 0, r, f);
				o.close(), o = null;
				const l = function(r, a = 4, o = 3) {
					const { width: i, height: s, data: f } = r, h = i * s;
					if (0 === h) return "L00000fQ00fQ00fQ00fQ";
					const l = Math.max(1, Math.min(9, a)), u = Math.max(1, Math.min(9, o)), c = new Float32Array(h), g = new Float32Array(h), d = new Float32Array(h);
					for (let e = 0; e < h; e++) {
						const n = 4 * e;
						c[e] = t[255 & f[n]], g[e] = t[255 & f[n + 1]], d[e] = t[255 & f[n + 2]];
					}
					const m = [];
					for (let e = 0; e < l; e++) {
						const t = new Float64Array(i);
						for (let n = 0; n < i; n++) t[n] = Math.cos(Math.PI * e * n / i);
						m.push(t);
					}
					const p = [];
					for (let e = 0; e < u; e++) {
						const t = new Float64Array(s);
						for (let n = 0; n < s; n++) t[n] = Math.cos(Math.PI * e * n / s);
						p.push(t);
					}
					const y = [];
					for (let e = 0; e < u; e++) {
						const t = p[e];
						for (let n = 0; n < l; n++) {
							const r = m[n];
							let a = 0, o = 0, f = 0;
							const l = 0 === n && 0 === e ? 1 : 2;
							let u = 0;
							for (let e = 0; e < s; e++) {
								const n = t[e];
								for (let e = 0; e < i; e++) {
									const t = r[e] * n;
									a += t * c[u], o += t * g[u], f += t * d[u], u++;
								}
							}
							const p = l / h;
							y.push([
								a * p,
								o * p,
								f * p
							]);
						}
					}
					const w = y[0], M = y.slice(1);
					let b = "";
					b += e(l - 1 + 9 * (u - 1), 1);
					let E = 0;
					if (M.length > 0) {
						for (const e of M) E = Math.max(E, Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2]));
						b += e(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * E - .5)))), 1);
					} else b += e(0, 1);
					const B = (e) => {
						const t = function(e) {
							const t = Math.max(0, Math.min(1, e));
							return t <= .0031308 ? Math.round(12.92 * t * 255) : Math.round(255 * (1.055 * Math.pow(t, 1 / 2.4) - .055));
						}(e);
						return 255 & Math.round(t);
					};
					b += e((B(w[0]) << 16) + (B(w[1]) << 8) + B(w[2]), 4);
					const I = 0 === E ? 1 : E;
					for (const t of M) b += e(19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * n(t[0] / I, .5) + 9.5)))) * 19 + 19 * Math.floor(Math.max(0, Math.min(18, Math.floor(9 * n(t[1] / I, .5) + 9.5)))) + Math.floor(Math.max(0, Math.min(18, Math.floor(9 * n(t[2] / I, .5) + 9.5)))), 2);
					return b;
				}(h, a.componentX || 4, a.componentY || 3), u = {
					id: a.id,
					ok: !0,
					type: "GENERATE_BLURHASH",
					blurhash: l
				};
				self.postMessage(u);
				return;
			}
			if ("COMPRESS_IMAGE" === a.type) {
				const e = Math.max(32, a.maxWidth || 1920), t = Math.max(32, a.maxHeight || 1080), n = Math.max(.05, Math.min(1, a.quality || .8));
				let r = o.width, f = o.height;
				if (r > e || f > t) {
					const n = Math.min(e / r, t / f);
					r = Math.max(1, Math.round(r * n)), f = Math.max(1, Math.round(f * n));
				}
				if (i = new OffscreenCanvas(r, f), s = i.getContext("2d"), !s) throw new Error("Could not get 2d canvas context");
				s.imageSmoothingEnabled = !0, s.imageSmoothingQuality = "high", s.drawImage(o, 0, 0, r, f), o.close(), o = null;
				const h = "image/png" === a.mimeType ? "image/png" : "image/jpeg", l = await (await i.convertToBlob({
					type: h,
					quality: n
				})).arrayBuffer(), u = {
					id: a.id,
					ok: !0,
					type: "COMPRESS_IMAGE",
					compressedBuffer: l,
					mimeType: h
				};
				self.postMessage(u, [l]);
				return;
			}
			if ("STRIP_EXIF" === a.type) {
				if (i = new OffscreenCanvas(o.width, o.height), s = i.getContext("2d"), !s) throw new Error("Could not get 2d canvas context");
				s.drawImage(o, 0, 0, o.width, o.height), o.close(), o = null;
				const e = "image/png" === a.mimeType ? "image/png" : "image/jpeg", t = await (await i.convertToBlob({
					type: e,
					quality: .98
				})).arrayBuffer(), n = {
					id: a.id,
					ok: !0,
					type: "STRIP_EXIF",
					cleanedBuffer: t,
					mimeType: e
				};
				self.postMessage(n, [t]);
				return;
			}
		} catch (f) {
			const e = {
				id: a?.id || "unknown",
				ok: !1,
				error: f?.message || "Worker processing failed"
			};
			self.postMessage(e);
		} finally {
			o && (o.close(), o = null), i && (i.width = 0, i.height = 0, i = null), s = null;
		}
	}, "undefined" != typeof self && "function" == typeof self.addEventListener && (self.addEventListener("error", (e) => {
		const t = e;
		self.postMessage({
			id: "unknown",
			ok: !1,
			error: t.message || "Media processor worker uncaught runtime error"
		});
	}), self.addEventListener("unhandledrejection", (e) => {
		const t = e;
		self.postMessage({
			id: "unknown",
			ok: !1,
			error: t.reason?.message || "Unhandled promise rejection in media processor worker"
		});
	}));
})();

//# sourceMappingURL=media-processor.worker-BFjwsxk1.js.map