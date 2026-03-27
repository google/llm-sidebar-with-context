#!/usr/bin/env node
/**
 * Packs the dist/ directory into a signed CRX3 file.
 *
 * Usage:
 *   CRX_PRIVATE_KEY=<base64-encoded-pem> node build-scripts/pack-crx.js
 *
 * Or with a PEM file:
 *   node build-scripts/pack-crx.js --key path/to/key.pem
 *
 * Output: dist/llm-sidebar.crx
 */
const nodeCrypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const outCrx = path.join(distDir, 'llm-sidebar.crx');

function getPrivateKey() {
  // From command line
  const keyFlagIdx = process.argv.indexOf('--key');
  if (keyFlagIdx !== -1 && process.argv[keyFlagIdx + 1]) {
    return fs.readFileSync(process.argv[keyFlagIdx + 1], 'utf-8');
  }

  // From environment (base64-encoded PEM)
  if (process.env.CRX_PRIVATE_KEY) {
    const decoded = Buffer.from(process.env.CRX_PRIVATE_KEY, 'base64').toString(
      'utf-8',
    );
    if (decoded.includes('BEGIN')) return decoded;
    // Maybe it's already plain PEM
    if (process.env.CRX_PRIVATE_KEY.includes('BEGIN'))
      return process.env.CRX_PRIVATE_KEY;
    return decoded;
  }

  return null;
}

function createZip(sourceDir) {
  const zipPath = path.join(projectRoot, 'dist-ext.zip');
  // Remove old zip
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // We need to zip the contents of dist/, not the dist/ dir itself
  execSync(`cd "${sourceDir}" && zip -r "${zipPath}" . -x "*.crx" "*.zip"`, {
    stdio: 'pipe',
  });

  const zipBuf = fs.readFileSync(zipPath);
  fs.unlinkSync(zipPath);
  return zipBuf;
}

/**
 * Build CRX3 format.
 * Reference: https://developer.chrome.com/docs/extensions/reference/api/crx
 *
 * CRX3 file layout:
 *   [4 bytes] "Cr24" magic
 *   [4 bytes] CRX version (3)
 *   [4 bytes] header length
 *   [header]  protobuf-encoded CRX3 header
 *   [zip]     the extension zip
 */
function packCrx3(zipBuf, pemKey) {
  const key = nodeCrypto.createPrivateKey(pemKey);
  const publicKeyDer = nodeCrypto.createPublicKey(key).export({
    type: 'spki',
    format: 'der',
  });

  // Sign the zip with the CRX3 "signed data" prefix
  // CRX3 signed data: CRX3 SignedData protobuf containing the crx_id
  const crxId = nodeCrypto
    .createHash('sha256')
    .update(publicKeyDer)
    .digest()
    .subarray(0, 16);

  // SignedData protobuf (field 1 = crx_id, wire type 2 = length-delimited)
  const signedDataPayload = Buffer.concat([
    Buffer.from([0x0a, crxId.length]), // field 1, length
    crxId,
  ]);

  // The data to sign: "CRX3 SignedData\x00" + LE32(signedDataLen) + signedData + zip
  const prefix = Buffer.from('CRX3 SignedData\x00');
  const signedDataLenBuf = Buffer.alloc(4);
  signedDataLenBuf.writeUInt32LE(signedDataPayload.length);

  const signInput = Buffer.concat([
    prefix,
    signedDataLenBuf,
    signedDataPayload,
    zipBuf,
  ]);

  const signature = nodeCrypto.sign('sha256', signInput, {
    key,
    padding: nodeCrypto.constants.RSA_PKCS1_PADDING,
  });

  // Build the CRX3 FileHeader protobuf
  // sha256_with_rsa proof: field 2 (AsymmetricKeyProof)
  //   - field 1: public_key (bytes)
  //   - field 2: signature (bytes)
  const proofPayload = Buffer.concat([
    // field 1: public_key
    Buffer.from([0x0a]),
    encodeVarint(publicKeyDer.length),
    publicKeyDer,
    // field 2: signature
    Buffer.from([0x12]),
    encodeVarint(signature.length),
    signature,
  ]);

  // CrxFileHeader protobuf
  const headerPayload = Buffer.concat([
    // field 2: sha256_with_rsa (repeated AsymmetricKeyProof)
    Buffer.from([0x12]),
    encodeVarint(proofPayload.length),
    proofPayload,
    // field 10000: signed_header_data
    Buffer.from([0x82, 0xf1, 0x04]),
    encodeVarint(signedDataPayload.length),
    signedDataPayload,
  ]);

  // Assemble CRX3 file
  const magic = Buffer.from('Cr24');
  const version = Buffer.alloc(4);
  version.writeUInt32LE(3);
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(headerPayload.length);

  return Buffer.concat([magic, version, headerLen, headerPayload, zipBuf]);
}

function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

function generateKey() {
  const { privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

async function main() {
  // Ensure dist/ exists with built extension
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.error(
      'Error: dist/manifest.json not found. Run `npm run build` first.',
    );
    process.exit(1);
  }

  let pemKey = getPrivateKey();

  if (!pemKey) {
    if (process.argv.includes('--generate-key')) {
      console.log('Generating new RSA key pair...');
      pemKey = generateKey();
      const keyPath = path.join(projectRoot, 'extension.pem');
      fs.writeFileSync(keyPath, pemKey);
      console.log(
        `Key saved to ${keyPath} — add base64 of this to CRX_PRIVATE_KEY secret`,
      );
    } else {
      console.error('Error: No private key provided.');
      console.error(
        'Set CRX_PRIVATE_KEY env var (base64-encoded PEM) or use --key <file>',
      );
      console.error('Or use --generate-key to create a new key');
      process.exit(1);
    }
  }

  console.log('Creating zip of dist/...');
  const zipBuf = createZip(distDir);

  console.log('Packing CRX3...');
  const crxBuf = packCrx3(zipBuf, pemKey);

  fs.writeFileSync(outCrx, crxBuf);
  console.log(`CRX written to ${outCrx} (${crxBuf.length} bytes)`);

  // Also output the extension ID for reference
  const key = nodeCrypto.createPrivateKey(pemKey);
  const publicKeyDer = nodeCrypto
    .createPublicKey(key)
    .export({ type: 'spki', format: 'der' });
  const hash = nodeCrypto.createHash('sha256').update(publicKeyDer).digest();
  const extensionId = Array.from(hash.subarray(0, 16))
    .map((b) => {
      const hi = (b >> 4) & 0xf;
      const lo = b & 0xf;
      return String.fromCharCode(97 + hi) + String.fromCharCode(97 + lo);
    })
    .join('');
  console.log(`Extension ID: ${extensionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
