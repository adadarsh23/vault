(function() {
	function e(t) {
		return e = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) {
			return typeof e;
		} : function(e) {
			return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
		}, e(t);
	}
	const t = new TextEncoder().encode("vault:e2ee:aes-gcm:v2");
	var r = class extends Error {
		constructor(t, r) {
			var o, n, s;
			super(r), o = this, s = void 0, (n = function(t) {
				var r = function(t) {
					if ("object" != e(t) || !t) return t;
					var r = t[Symbol.toPrimitive];
					if (void 0 !== r) {
						var o = r.call(t, "string");
						if ("object" != e(o)) return o;
						throw new TypeError("@@toPrimitive must return a primitive value.");
					}
					return String(t);
				}(t);
				return "symbol" == e(r) ? r : r + "";
			}(n = "code")) in o ? Object.defineProperty(o, n, {
				value: s,
				enumerable: !0,
				configurable: !0,
				writable: !0
			}) : o[n] = s, this.name = "WorkerProtocolError", this.code = t;
		}
	};
	const o = self;
	o.onmessage = async (e) => {
		let n;
		try {
			const s = ((e) => {
				if (!e || "object" != typeof e) throw new r("INVALID_PAYLOAD", "Worker payload must be an object.");
				const t = e;
				if (!(t.fileBuffer instanceof ArrayBuffer)) throw new r("INVALID_PAYLOAD", "fileBuffer must be an ArrayBuffer.");
				if ("string" != typeof t.secretKey && !(t.secretKey instanceof CryptoKey)) throw new r("INVALID_PAYLOAD", "secretKey must be a string or a CryptoKey.");
				if (void 0 !== t.requestId && "string" != typeof t.requestId) throw new r("INVALID_PAYLOAD", "requestId must be a string when provided.");
				return {
					fileBuffer: t.fileBuffer,
					secretKey: t.secretKey,
					requestId: t.requestId
				};
			})(e.data);
			if (n = s.requestId, !crypto?.subtle?.encrypt || !crypto?.subtle?.importKey) throw new r("UNSUPPORTED_CRYPTO", "WebCrypto AES-GCM APIs are unavailable in this environment.");
			const { fileBuffer: i, secretKey: a } = s, c = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12)), f = Uint8Array.from(c), y = Uint8Array.from(t);
			let l;
			if (a instanceof CryptoKey) l = a;
			else {
				const e = ((e) => {
					const t = e.trim();
					if (!t || t.length > 1024) throw new r("INVALID_SECRET_KEY", "Secret key format is invalid.");
					if (!/^[A-Za-z0-9+/]+={0,2}$/.test(o = t) || o.length % 4 == 1) throw new r("INVALID_SECRET_KEY", "Secret key must be valid base64.");
					var o;
					let n;
					try {
						n = atob(t);
					} catch {
						throw new r("INVALID_SECRET_KEY", "Secret key is not decodable base64.");
					}
					const s = new Uint8Array(n.length);
					for (let r = 0; r < n.length; r++) s[r] = n.charCodeAt(r);
					return s;
				})(a);
				if (32 !== e.length) throw new r("INVALID_SECRET_KEY", "Invalid key length: expected 32 bytes.");
				const t = Uint8Array.from(e);
				l = await crypto.subtle.importKey("raw", t, { name: "AES-GCM" }, !1, ["encrypt"]), e.fill(0), t.fill(0);
			}
			const u = await crypto.subtle.encrypt({
				name: "AES-GCM",
				iv: f,
				additionalData: y
			}, l, i), d = new Uint8Array(c.length + u.byteLength);
			d.set(c), d.set(new Uint8Array(u), c.length);
			const m = {
				ok: !0,
				encryptedBuffer: d.buffer,
				requestId: n
			};
			o.postMessage(m, [d.buffer]);
		} catch (s) {
			const e = ((e) => e instanceof r ? {
				code: e.code,
				message: e.message
			} : e instanceof Error ? {
				code: "ENCRYPTION_FAILED",
				message: e.message
			} : {
				code: "ENCRYPTION_FAILED",
				message: "File encryption failed."
			})(s);
			((e, t, r) => {
				const n = {
					ok: !1,
					error: r,
					code: t,
					requestId: e
				};
				o.postMessage(n);
			})(n, e.code, e.message);
		}
	};
})();

//# sourceMappingURL=encrypt-file.worker-BYre01OT.js.map