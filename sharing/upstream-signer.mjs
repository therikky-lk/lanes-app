// The same signer shipped with Lane, compiled by Wrangler as a WASM module.
export function createSigner(module) {
  const signer = new WebAssembly.Instance(module).exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return (method, path, body = "") => {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = [...crypto.getRandomValues(new Uint8Array(8))].map(value => value.toString(16).padStart(2, "0")).join("");
    const allocations = [];
    const allocate = text => {
      const bytes = encoder.encode(text);
      const pointer = signer.liner_alloc(bytes.length);
      new Uint8Array(signer.memory.buffer, pointer, bytes.length).set(bytes);
      allocations.push([pointer, bytes.length]);
      return [pointer, bytes.length];
    };
    try {
      const args = [...allocate(method), ...allocate(path.split("?")[0]), ...allocate(body), BigInt(timestamp), ...allocate(nonce)];
      if (signer.liner_sign_request(...args) !== 0) throw new Error("Could not sign account request");
      const signature = decoder.decode(new Uint8Array(signer.memory.buffer, signer.liner_get_result_ptr(), signer.liner_get_result_len()));
      if (!signature) throw new Error("Empty account signature");
      return { "x-liner-signature": signature, "x-liner-timestamp": String(timestamp), "x-liner-nonce": nonce };
    } finally {
      for (const [pointer, length] of allocations) signer.liner_dealloc(pointer, length);
    }
  };
}
