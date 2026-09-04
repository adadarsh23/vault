(function() {
	function e(e, t) {
		let n = "";
		for (let a = 1; a <= t; a++) n += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(e / Math.pow(83, t - a)) % 83];
		return n;
	}
	self.onmessage = async (t) => {
		const n = t.data;
		try {
			if ("STRIP_EXIF" === n.type) {
				const e = "image/jpeg" === n.mimeType || "image/jpg" === n.mimeType || "image/pjpeg" === n.mimeType, t = "image/png" === n.mimeType, a = "image/webp" === n.mimeType;
				if (e) {
					const e = function(e) {
						const t = new DataView(e);
						if (t.byteLength < 4 || 65496 !== t.getUint16(0)) return e;
						const n = [];
						n.push(new Uint8Array(e, 0, 2));
						let a = 2;
						for (; a < t.byteLength;) {
							if (255 !== t.getUint8(a)) {
								n.push(new Uint8Array(e, a));
								break;
							}
							for (; a < t.byteLength && 255 === t.getUint8(a);) a++;
							if (a >= t.byteLength) break;
							const r = 65280 | t.getUint8(a);
							if (a++, 65498 === r) {
								n.push(new Uint8Array(e, a - 2));
								break;
							}
							if (65497 === r) {
								n.push(new Uint8Array(e, a - 2, 2));
								break;
							}
							if (r >= 65488 && r <= 65495) {
								n.push(new Uint8Array(e, a - 2, 2));
								continue;
							}
							if (a + 2 > t.byteLength) break;
							const o = t.getUint16(a);
							if (o < 2 || a + o > t.byteLength) break;
							r >= 65505 && r <= 65519 || 65534 === r || n.push(new Uint8Array(e, a - 2, 2 + o)), a += o;
						}
						const r = n.reduce((e, t) => e + t.byteLength, 0), o = new Uint8Array(r);
						let i = 0;
						for (const s of n) o.set(s, i), i += s.byteLength;
						return o.buffer;
					}(n.fileBuffer), t = {
						id: n.id,
						ok: !0,
						type: "STRIP_EXIF",
						cleanedBuffer: e,
						mimeType: "image/jpeg"
					};
					self.postMessage(t, [e]);
					return;
				}
				if (t) {
					const e = function(e) {
						const t = new Uint8Array(e);
						if (t.length < 8 || 137 !== t[0] || 80 !== t[1] || 78 !== t[2] || 71 !== t[3] || 13 !== t[4] || 10 !== t[5] || 26 !== t[6] || 10 !== t[7]) return e;
						const n = [];
						n.push(t.subarray(0, 8));
						const a = /* @__PURE__ */ new Set([
							"eXIf",
							"tEXt",
							"zTXt",
							"iTXt",
							"tIME"
						]);
						let r = 8;
						const o = new DataView(e);
						for (; r + 12 <= t.length;) {
							const e = o.getUint32(r), i = String.fromCharCode(t[r + 4], t[r + 5], t[r + 6], t[r + 7]), s = 12 + e;
							if (r + s > t.length) break;
							if (a.has(i) || n.push(t.subarray(r, r + s)), r += s, "IEND" === i) break;
						}
						const i = n.reduce((e, t) => e + t.byteLength, 0), s = new Uint8Array(i);
						let f = 0;
						for (const g of n) s.set(g, f), f += g.byteLength;
						return s.buffer;
					}(n.fileBuffer), t = {
						id: n.id,
						ok: !0,
						type: "STRIP_EXIF",
						cleanedBuffer: e,
						mimeType: "image/png"
					};
					self.postMessage(t, [e]);
					return;
				}
				if (a) {
					const e = function(e) {
						const t = new Uint8Array(e);
						if (t.length < 12) return e;
						const n = String.fromCharCode(t[0], t[1], t[2], t[3]), a = String.fromCharCode(t[8], t[9], t[10], t[11]);
						if ("RIFF" !== n || "WEBP" !== a) return e;
						const r = new DataView(e), o = [];
						let i = 12;
						for (; i + 8 <= t.length;) {
							const e = String.fromCharCode(t[i], t[i + 1], t[i + 2], t[i + 3]), n = r.getUint32(i + 4, !0), a = 8 + (n + n % 2);
							if (i + 8 + n > t.length) break;
							if ("EXIF" !== e && "XMP " !== e) {
								let n = t.subarray(i, Math.min(i + a, t.length));
								"VP8X" === e && n.length >= 16 && (n = new Uint8Array(n), n[8] = -9 & n[8], n[8] = -5 & n[8]), o.push(n);
							}
							i += a;
						}
						const s = 12 + o.reduce((e, t) => e + t.byteLength, 0), f = new Uint8Array(s);
						f.set(t.subarray(0, 4), 0), new DataView(f.buffer).setUint32(4, s - 8, !0), f.set(t.subarray(8, 12), 8);
						let g = 12;
						for (const h of o) f.set(h, g), g += h.byteLength;
						return f.buffer;
					}(n.fileBuffer), t = {
						id: n.id,
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
			const t = new Blob([n.fileBuffer], { type: n.mimeType }), a = await createImageBitmap(t);
			if ("GENERATE_THUMBNAIL" === n.type) {
				const e = n.maxWidth || 300, t = n.maxHeight || 300;
				let r = a.width, o = a.height;
				if (r > e || o > t) {
					const n = Math.min(e / r, t / o);
					r = Math.round(r * n), o = Math.round(o * n);
				}
				const i = new OffscreenCanvas(r, o), s = i.getContext("2d");
				if (!s) throw new Error("Could not get 2d canvas context");
				s.drawImage(a, 0, 0, r, o);
				const f = await (await i.convertToBlob({
					type: "image/jpeg",
					quality: .8
				})).arrayBuffer(), g = {
					id: n.id,
					ok: !0,
					type: "GENERATE_THUMBNAIL",
					thumbnailBuffer: f,
					mimeType: "image/jpeg"
				};
				self.postMessage(g, [f]), a.close();
				return;
			}
			if ("GENERATE_BLURHASH" === n.type) {
				const t = 32, r = 32, o = new OffscreenCanvas(t, r).getContext("2d");
				if (!o) throw new Error("Could not get 2d canvas context");
				o.drawImage(a, 0, 0, t, r);
				const i = function(t, n = 4, a = 3) {
					const { width: r, height: o, data: i } = t, s = r * o, f = [];
					for (let e = 0; e < a; e++) for (let t = 0; t < n; t++) {
						let n = 0, a = 0, g = 0;
						const h = 0 === t && 0 === e ? 1 : 2;
						for (let f = 0; f < s; f++) {
							const s = f % r, h = Math.floor(f / r), c = Math.cos(Math.PI * t * s / r) * Math.cos(Math.PI * e * h / o), p = 4 * f;
							n += c * Math.pow(i[p] / 255, 2.2), a += c * Math.pow(i[p + 1] / 255, 2.2), g += c * Math.pow(i[p + 2] / 255, 2.2);
						}
						const c = h / s;
						f.push([
							n * c,
							a * c,
							g * c
						]);
					}
					const g = f[0], h = f.slice(1);
					let c = "";
					c += e(n - 1 + 9 * (a - 1), 1);
					let p = 0;
					if (h.length > 0) {
						for (const e of h) p = Math.max(p, Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2]));
						c += e(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * p - .5)))), 1);
					} else c += e(0, 1);
					const m = (e) => e <= .0031308 ? 12.92 * e : 1.055 * Math.pow(e, 1 / 2.4) - .055;
					return c += e(((e) => {
						const t = m(Math.max(0, Math.min(1, e)));
						return (Math.floor(255 * t) << 16) + (Math.floor(255 * m(Math.max(0, Math.min(1, e)))) << 8) + Math.floor(255 * t);
					})(g[0]), 4), c;
				}(o.getImageData(0, 0, t, r), n.componentX || 4, n.componentY || 3), s = {
					id: n.id,
					ok: !0,
					type: "GENERATE_BLURHASH",
					blurhash: i
				};
				self.postMessage(s), a.close();
				return;
			}
			if ("COMPRESS_IMAGE" === n.type) {
				const e = n.maxWidth || 1920, t = n.maxHeight || 1080, r = n.quality || .8;
				let o = a.width, i = a.height;
				if (o > e || i > t) {
					const n = Math.min(e / o, t / i);
					o = Math.round(o * n), i = Math.round(i * n);
				}
				const s = new OffscreenCanvas(o, i), f = s.getContext("2d");
				if (!f) throw new Error("Could not get 2d canvas context");
				f.drawImage(a, 0, 0, o, i);
				const g = "image/png" === n.mimeType ? "image/png" : "image/jpeg", h = await (await s.convertToBlob({
					type: g,
					quality: r
				})).arrayBuffer(), c = {
					id: n.id,
					ok: !0,
					type: "COMPRESS_IMAGE",
					compressedBuffer: h,
					mimeType: g
				};
				self.postMessage(c, [h]), a.close();
				return;
			}
			if ("STRIP_EXIF" === n.type) {
				const e = new OffscreenCanvas(a.width, a.height), t = e.getContext("2d");
				if (!t) throw new Error("Could not get 2d canvas context");
				t.drawImage(a, 0, 0, a.width, a.height);
				const r = "image/png" === n.mimeType ? "image/png" : "image/jpeg", o = await (await e.convertToBlob({
					type: r,
					quality: .98
				})).arrayBuffer(), i = {
					id: n.id,
					ok: !0,
					type: "STRIP_EXIF",
					cleanedBuffer: o,
					mimeType: r
				};
				self.postMessage(i, [o]), a.close();
				return;
			}
		} catch (a) {
			const e = {
				id: n.id,
				ok: !1,
				error: a.message || "Worker processing failed"
			};
			self.postMessage(e);
		}
	};
})();

//# sourceMappingURL=media-processor.worker-BDVNIZxq.js.map