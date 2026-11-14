import { Upload } from 'tus-js-client'
import { signedResumableUploadOptions } from '@cairn/shared'

// 50MiB を超え得る動画は、upload-url が発行した署名トークンを x-signature に載せた TUS で送る。
// ファイル全体をメモリへ読み込まず、6MB ずつ送り、回線が切れても途中から再送する
export function uploadResumableToStorage(input: {
  supabaseUrl: string
  apiKey: string
  bucket: string
  storagePath: string
  token: string
  mimeType: string
  file: { uri: string; name: string; type: string }
  onProgress?: (uploadedBytes: number, totalBytes: number) => void
}): Promise<void> {
  const options = signedResumableUploadOptions({
    supabaseUrl: input.supabaseUrl,
    apiKey: input.apiKey,
    bucket: input.bucket,
    objectPath: input.storagePath,
    token: input.token,
    contentType: input.mimeType,
  })
  return new Promise<void>((resolve, reject) => {
    // React Native では uri を持つオブジェクトを渡すと、tus-js-client がネイティブの Blob として読む
    const upload = new Upload(input.file as unknown as Blob, {
      endpoint: options.endpoint,
      headers: options.headers,
      metadata: options.metadata,
      chunkSize: options.chunkSize,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      // 署名ごとに保存先が変わるため、別の送信の続きとして再開させない
      storeFingerprintForResuming: false,
      onProgress: (sent, total) => input.onProgress?.(sent, total),
      onError: reject,
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}
