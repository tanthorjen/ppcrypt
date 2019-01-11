import { ab2str } from 'arraybuffer-to-string'
import { str2ab } from 'string-to-arraybuffer'
/// All the encrypt/decrypt functions are here


const $EncfileRegex = /([A-Za-z0-9\+\-=]+)_([A-Za-z0-9\+\-=]+)\.ppcrypt/

export interface IDecryptedFilename {
  iv: Uint8Array;
  name: string;
}

// export function readFile(file: File): Promise<ArrayBuffer> {
//   return new Promise((resolve, reject) => {
//     let fr = new FileReader()
//     fr.onload = (e) => resolve(fr.result as ArrayBuffer)
//     fr.onerror = (e) => reject(fr.error)
//     fr.readAsArrayBuffer(file)
//   })
// }

export function readBlob(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = (e) => resolve(fr.result as ArrayBuffer)
    fr.onerror = (e) => reject(fr.error)
    fr.readAsArrayBuffer(file)
  })
}

export function genIv(): Uint8Array {
  return  window.crypto.getRandomValues(new Uint8Array(12))
}

export async function encryptFilename(key: CryptoKey, iv: Uint8Array, filename: string): Promise<string> {
  return safe_b64(`${u8tob64(iv)}_${abtob64(await encrypt(key, iv, strtoab(filename)))}.ppcrypt`)
}

export async function decryptFilename(key: CryptoKey, filename: string): Promise<IDecryptedFilename | null> {
  const arr = $EncfileRegex.exec(filename)
  if (arr) {
    try {
      const iv = b64tou8(unsafe_b64(arr[1]))
      const name = abtostr(await decrypt(key, iv, b64toab(unsafe_b64(arr[2]))))
      return { iv, name }
    } catch(e) {
      console.log(e)
      return null
    }
  } else {
    return null
  }
}

export async function passwordToKey(password: string): Promise<CryptoKey> {
  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  )
  return await window.crypto.subtle.deriveKey(
    {
      "name": "PBKDF2",
      "iterations": 100000,
      "hash": "SHA-256",
      salt: b64toab("iEqDINbB6UIZ1oI0p0TrbQ==")
    },
    keyMaterial,
    { "name": "AES-GCM", "length": 256},
    true,
    [ "encrypt", "decrypt" ]
  );
}

export async function encrypt(key: CryptoKey, iv: Uint8Array, plaintext: ArrayBuffer): Promise<ArrayBuffer> {
  return window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    plaintext
  );
}

export async function decrypt(key: CryptoKey, iv: Uint8Array, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
  return window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    ciphertext
  );
}

function safe_b64(s:string): string {
  return s.replace(/\//g, "-")
}

function unsafe_b64(s:string): string {
  return s.replace(/\-/g, "/")
}

function abtostr(buf: ArrayBuffer): string {
  return ab2str(buf, 'utf8')
}

function strtoab(str: string): ArrayBuffer {
  return str2ab(str, 'utf8')
}

function u8tob64(u8: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, u8));
}

function b64tou8(base64: string): Uint8Array {
    const binstring =  window.atob(base64);
    const len = binstring.length;
    const bytes = new Uint8Array( len );
    for (let i = 0; i < len; i++)        {
        bytes[i] = binstring.charCodeAt(i);
    }
    return bytes;
}

function b64toab(base64: string): ArrayBuffer {
    const binstring =  window.atob(base64);
    const len = binstring.length;
    const bytes = new Uint8Array( len );
    for (let i = 0; i < len; i++)        {
        bytes[i] = binstring.charCodeAt(i);
    }
    return bytes.buffer;
}

function abtob64( buffer: ArrayBuffer ): string {
    let binary = '';
    const bytes = new Uint8Array( buffer );
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

