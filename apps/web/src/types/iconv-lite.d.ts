declare module 'iconv-lite' {
  export function decode(buffer: Uint8Array | Buffer, encoding: string): string
  export function encode(content: string, encoding: string): Buffer
  export function encodingExists(encoding: string): boolean

  const iconv: {
    decode: typeof decode
    encode: typeof encode
    encodingExists: typeof encodingExists
  }

  export default iconv
}
