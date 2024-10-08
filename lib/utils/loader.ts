import { DownloadRecord, gifData } from '../type'
import { DownloadStore } from '../store/downloaded'

const download = async (url: string) => {
  DownloadStore.addRecord(url)
  const promise = new Promise<gifData>((resolve, reject) => {
    const h = new XMLHttpRequest()
    // new browsers (XMLHttpRequest2-compliant)
    h.open('GET', url, true)

    if ('overrideMimeType' in h) {
      h.overrideMimeType('text/plain; charset=x-user-defined')
    } else if ('responseType' in h) {
      // old browsers (XMLHttpRequest-compliant)
      (h as XMLHttpRequest).responseType = 'arraybuffer'
    } else {
      // IE9 (Microsoft.XMLHTTP-compliant)
      (h as XMLHttpRequest).setRequestHeader('Accept-Charset', 'x-user-defined')
    }

    h.onloadstart = () => {}
    h.onload = (e) => {
      if (h.status != 200) {
        DownloadStore.setError(url, 'xhr - response')
        reject('xhr - response')
      }
      let data: gifData = ''
      if (typeof h.response === 'string') {
        data = h.response
      } else if (h.response.toString().indexOf('ArrayBuffer') > 0) {
        data = new Uint8Array(h.response)
      }
      DownloadStore.setProgress(url, 100, data)
      resolve(data)
    }
    h.onprogress = (e) => {
      const data: gifData = e.currentTarget
        ? (e.currentTarget as any).response
        : ''
      e.lengthComputable &&
        DownloadStore.setProgress(url, e.loaded / e.total, data)
    }
    h.onerror = () => {
      DownloadStore.setError(url, 'xhr')
      reject('xhr')
    }
    h.send()
  })
  const data = await promise
  return data
}

export const load_url = async (
  url: string
): Promise<Required<DownloadRecord>> => {
  const downloadStatus = DownloadStore.getDownloadStatus(url)
  if (downloadStatus === 'downloaded') {
    return DownloadStore.getDownload(url) as Required<DownloadRecord>
  }
  if (downloadStatus === 'none') {
    download(url).then((data) => DownloadStore.setDownload(url, data))
  }
  await new Promise<gifData>((resolve) => {
    const onLoad = (event: { data: gifData; key: string }) => {
      if (event.key !== url) {
        return
      }
      DownloadStore.off('downloaded', onLoad)
      resolve(event.data)
    }
    DownloadStore.on('downloaded', onLoad)
  })
  return DownloadStore.getDownload(url) as Required<DownloadRecord>
}

export const load_raw = (data: gifData, key: string) => {
  DownloadStore.setDownload(key, data)
  return DownloadStore.getDownload(key)
}
