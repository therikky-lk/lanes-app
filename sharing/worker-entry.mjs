import signerModule from "./signer.wasm";
import { createSigner } from "./upstream-signer.mjs";
import worker from "./worker.mjs";
const signRequest = createSigner(signerModule);
export default { fetch(request, env) { return worker.fetch(request, { ...env, signRequest }); } };
