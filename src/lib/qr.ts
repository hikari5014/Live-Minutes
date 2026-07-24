import QRCode from 'qrcode'

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F1720', light: '#FFFFFF' },
  })
}
