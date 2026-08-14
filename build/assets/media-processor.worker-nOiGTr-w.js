(function() {
	function t(t, e) {
		let a = "";
		for (let o = 1; o <= e; o++) a += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"[Math.floor(t / Math.pow(83, e - o)) % 83];
		return a;
	}
	self.onmessage = async (e) => {
		const a = e.data;
		try {
			if ("undefined" == typeof OffscreenCanvas || "undefined" == typeof createImageBitmap) throw new Error("OffscreenCanvas or createImageBitmap is not supported in Web Worker environment");
			const e = new Blob([a.fileBuffer], { type: a.mimeType }), o = await createImageBitmap(e);
			if ("GENERATE_THUMBNAIL" === a.type) {
				const t = a.maxWidth || 300, e = a.maxHeight || 300;
				let n = o.width, r = o.height;
				if (n > t || r > e) {
					const a = Math.min(t / n, e / r);
					n = Math.round(n * a), r = Math.round(r * a);
				}
				const s = new OffscreenCanvas(n, r), i = s.getContext("2d");
				if (!i) throw new Error("Could not get 2d canvas context");
				i.drawImage(o, 0, 0, n, r);
				const f = await (await s.convertToBlob({
					type: "image/jpeg",
					quality: .8
				})).arrayBuffer(), h = {
					id: a.id,
					ok: !0,
					type: "GENERATE_THUMBNAIL",
					thumbnailBuffer: f,
					mimeType: "image/jpeg"
				};
				self.postMessage(h, [f]), o.close();
				return;
			}
			if ("GENERATE_BLURHASH" === a.type) {
				const e = 32, n = 32, r = new OffscreenCanvas(e, n).getContext("2d");
				if (!r) throw new Error("Could not get 2d canvas context");
				r.drawImage(o, 0, 0, e, n);
				const s = function(e, a = 4, o = 3) {
					const { width: n, height: r, data: s } = e, i = n * r, f = [];
					for (let t = 0; t < o; t++) for (let e = 0; e < a; e++) {
						let a = 0, o = 0, h = 0;
						const c = 0 === e && 0 === t ? 1 : 2;
						for (let f = 0; f < i; f++) {
							const i = f % n, c = Math.floor(f / n), m = Math.cos(Math.PI * e * i / n) * Math.cos(Math.PI * t * c / r), M = 4 * f;
							a += m * Math.pow(s[M] / 255, 2.2), o += m * Math.pow(s[M + 1] / 255, 2.2), h += m * Math.pow(s[M + 2] / 255, 2.2);
						}
						const m = c / i;
						f.push([
							a * m,
							o * m,
							h * m
						]);
					}
					const h = f[0], c = f.slice(1);
					let m = "";
					m += t(a - 1 + 9 * (o - 1), 1);
					let M = 0;
					if (c.length > 0) {
						for (const t of c) M = Math.max(M, Math.abs(t[0]), Math.abs(t[1]), Math.abs(t[2]));
						m += t(Math.floor(Math.max(0, Math.min(82, Math.floor(166 * M - .5)))), 1);
					} else m += t(0, 1);
					const d = (t) => t <= .0031308 ? 12.92 * t : 1.055 * Math.pow(t, 1 / 2.4) - .055;
					return m += t(((t) => {
						const e = d(Math.max(0, Math.min(1, t)));
						return (Math.floor(255 * e) << 16) + (Math.floor(255 * d(Math.max(0, Math.min(1, t)))) << 8) + Math.floor(255 * e);
					})(h[0]), 4), m;
				}(r.getImageData(0, 0, e, n), a.componentX || 4, a.componentY || 3), i = {
					id: a.id,
					ok: !0,
					type: "GENERATE_BLURHASH",
					blurhash: s
				};
				self.postMessage(i), o.close();
				return;
			}
			if ("COMPRESS_IMAGE" === a.type) {
				const t = a.maxWidth || 1920, e = a.maxHeight || 1080, n = a.quality || .8;
				let r = o.width, s = o.height;
				if (r > t || s > e) {
					const a = Math.min(t / r, e / s);
					r = Math.round(r * a), s = Math.round(s * a);
				}
				const i = new OffscreenCanvas(r, s), f = i.getContext("2d");
				if (!f) throw new Error("Could not get 2d canvas context");
				f.drawImage(o, 0, 0, r, s);
				const h = "image/png" === a.mimeType ? "image/png" : "image/jpeg", c = await (await i.convertToBlob({
					type: h,
					quality: n
				})).arrayBuffer(), m = {
					id: a.id,
					ok: !0,
					type: "COMPRESS_IMAGE",
					compressedBuffer: c,
					mimeType: h
				};
				self.postMessage(m, [c]), o.close();
				return;
			}
		} catch (o) {
			const t = {
				id: a.id,
				ok: !1,
				error: o.message || "Worker processing failed"
			};
			self.postMessage(t);
		}
	};
})();

//# sourceMappingURL=media-processor.worker-nOiGTr-w.js.map