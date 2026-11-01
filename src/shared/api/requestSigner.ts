import { SIGNER_WASM_BASE64 } from "../../../electron/signer";
import { getServerTimeOffset } from "./serverTime";
import { diag } from "@/shared/platform/diag";

type SignRequestInput = {
  method: string;
  path: string;
  body?: string | null;
  timestamp?: number;
};

type SignatureResult = {
  signature?: string;
  timestamp?: number;
  nonce?: string;
  error?: string;
};

type SignerWasm = {
  liner_alloc: (len: number) => number;
  liner_dealloc: (ptr: number, len: number) => void;
  liner_get_result_ptr: () => number;
  liner_get_result_len: () => number;
  liner_sign_request: (
    methodPtr: number,
    methodLen: number,
    pathPtr: number,
    pathLen: number,
    bodyPtr: number,
    bodyLen: number,
    timestamp: bigint,
    noncePtr: number,
    nonceLen: number,
  ) => number;
  memory: WebAssembly.Memory;
};

type SignedHeaders = {
  "x-liner-signature"?: string;
  "x-liner-timestamp"?: string;
  "x-liner-nonce"?: string;
};

let wasmSigner: SignerWasm | null = null;
let nativeSignerLogged = false;

function isAndroidCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android");
}

function getWasmSigner(): SignerWasm {
  if (wasmSigner) return wasmSigner;
  const binary = Uint8Array.from(atob(SIGNER_WASM_BASE64), (char) => char.charCodeAt(0));
  const instance = new WebAssembly.Instance(new WebAssembly.Module(binary), {});
  wasmSigner = instance.exports as unknown as SignerWasm;
  return wasmSigner;
}

function withWasmString(
  signer: SignerWasm,
  value: string,
): { ptr: number; len: number; free: () => void } {
  const bytes = new TextEncoder().encode(value);
  const ptr = signer.liner_alloc(bytes.length);
  new Uint8Array(signer.memory.buffer, ptr, bytes.length).set(bytes);
  return { ptr, len: bytes.length, free: () => signer.liner_dealloc(ptr, bytes.length) };
}

function signInAndroid(input: SignRequestInput): SignatureResult {
  const signer = getWasmSigner();
  const timestamp = input.timestamp ?? Math.floor((Date.now() + getServerTimeOffset()) / 1000);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const nonce = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const method = withWasmString(signer, input.method);
  const path = withWasmString(signer, input.path);
  const body = withWasmString(signer, input.body ?? "");
  const nonceInput = withWasmString(signer, nonce);

  try {
    const code = signer.liner_sign_request(
      method.ptr,
      method.len,
      path.ptr,
      path.len,
      body.ptr,
      body.len,
      BigInt(timestamp),
      nonceInput.ptr,
      nonceInput.len,
    );
    if (code !== 0) throw new Error(`WASM signer failed with code ${code}`);
    const resultPtr = signer.liner_get_result_ptr();
    const resultLen = signer.liner_get_result_len();
    const signature = new TextDecoder().decode(
      new Uint8Array(signer.memory.buffer, resultPtr, resultLen),
    );
    if (!signature) throw new Error("WASM signer returned an empty signature");
    return { signature, timestamp, nonce };
  } finally {
    method.free();
    path.free();
    body.free();
    nonceInput.free();
  }
}

export async function signApiRequest(
  method: string,
  path: string,
  body?: string | null,
  customTimestamp?: number,
): Promise<SignedHeaders> {
  const cleanPath = path.split("?")[0].trim();
  const timestamp = customTimestamp ?? Math.floor((Date.now() + getServerTimeOffset()) / 1000);
  const input: SignRequestInput = {
    method: method.toUpperCase().trim(),
    path: cleanPath,
    body: body ?? undefined,
    timestamp,
  };

  let result: SignatureResult | undefined;
  if (typeof window !== "undefined" && window.linerElectron?.signRequest) {
    result = await window.linerElectron.signRequest(input);
  } else if (isAndroidCapacitor()) {
    result = signInAndroid(input);
    if (!nativeSignerLogged) {
      diag("Android API requests signed with the Lane request signer");
      nativeSignerLogged = true;
    }
  } else {
    return {};
  }

  if (result?.error) throw new Error(`Lane request signer failed: ${result.error}`);
  if (!result?.signature || !result.nonce) {
    throw new Error("Lane request signer did not return a signature");
  }
  return {
    "x-liner-signature": result.signature,
    "x-liner-timestamp": String(result.timestamp ?? timestamp),
    "x-liner-nonce": result.nonce,
  };
}
