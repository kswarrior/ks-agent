import fs from 'node:fs'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipSource {
  name: string
  data?: Buffer
  filePath?: string
  directory?: boolean
  mtime?: number
}

export interface ZipEntry {
  name: string
  data: Buffer
  directory: boolean
}

interface CentralEntry {
  name: Buffer
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  offset: number
  directory: boolean
  mtime: number
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[index] = value >>> 0
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(value: number): { time: number; date: number } {
  const source = new Date(value)
  const date = Number.isNaN(source.getTime()) ? new Date() : source
  const year = Math.max(1980, date.getFullYear())
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

function sourceData(source: ZipSource): Buffer {
  if (source.directory) return Buffer.alloc(0)
  if (source.data) return source.data
  if (source.filePath) return fs.readFileSync(source.filePath)
  return Buffer.alloc(0)
}

export function createZip(sources: ZipSource[]): Buffer {
  const chunks: Buffer[] = []
  const central: CentralEntry[] = []
  const now = Date.now()
  let offset = 0

  for (const source of sources) {
    const name = Buffer.from(source.name.replace(/\\/g, '/'), 'utf8')
    const data = sourceData(source)
    const crc = crc32(data)
    const directory = Boolean(source.directory) || source.name.endsWith('/')
    let method = 0
    let payload = data
    if (!directory && data.length > 0) {
      const compressed = deflateRawSync(data, { level: 6 })
      if (compressed.length < data.length) {
        method = 8
        payload = compressed
      }
    }
    if (data.length > 0xffffffff || payload.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('Backup is too large for a standard ZIP archive')
    }
    const { time, date } = dosDateTime(source.mtime ?? now)
    const flags = 0x0800

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, name, payload)
    central.push({
      name,
      method,
      crc,
      compressedSize: payload.length,
      uncompressedSize: data.length,
      offset,
      directory,
      mtime: source.mtime ?? now
    })
    offset += local.length + name.length + payload.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const entry of central) {
    const { time, date } = dosDateTime(entry.mtime)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(0x031e, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(entry.method, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(entry.crc, 16)
    header.writeUInt32LE(entry.compressedSize, 20)
    header.writeUInt32LE(entry.uncompressedSize, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(entry.directory ? (0o040755 << 16) >>> 0 : (0o100644 << 16) >>> 0, 38)
    header.writeUInt32LE(entry.offset, 42)
    chunks.push(header, entry.name)
    centralSize += header.length + entry.name.length
  }

  if (central.length > 0xffff || centralSize > 0xffffffff || centralStart > 0xffffffff) {
    throw new Error('Backup is too large for a standard ZIP archive')
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)
  chunks.push(end)

  return Buffer.concat(chunks)
}

export function readZip(
  buffer: Buffer,
  options: { maxEntries?: number; maxTotalBytes?: number } = {}
): ZipEntry[] {
  const maxEntries = options.maxEntries ?? 100_000
  const maxTotalBytes = options.maxTotalBytes ?? 1024 * 1024 * 1024
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff)
  let endOffset = -1
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) !== 0x06054b50) continue
    const commentLength = buffer.readUInt16LE(index + 20)
    if (index + 22 + commentLength === buffer.length) {
      endOffset = index
      break
    }
  }
  if (endOffset === -1) throw new Error('The file is not a valid ZIP archive')

  const totalEntries = buffer.readUInt16LE(endOffset + 10)
  const centralSize = buffer.readUInt32LE(endOffset + 12)
  const centralOffset = buffer.readUInt32LE(endOffset + 16)
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported')
  }
  if (totalEntries > maxEntries) throw new Error('The archive contains too many files')
  if (centralOffset + centralSize > buffer.length) throw new Error('The ZIP central directory is corrupted')

  const entries: ZipEntry[] = []
  let cursor = centralOffset
  let totalBytes = 0
  for (let count = 0; count < totalEntries; count += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('The ZIP central directory is corrupted')
    }
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const crc = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > buffer.length) throw new Error('The ZIP central directory is corrupted')
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8')
    cursor = nameEnd + extraLength + commentLength
    if (flags & 1) throw new Error('Encrypted ZIP archives are not supported')
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP entry: ${name}`)
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buffer.length) throw new Error(`Invalid ZIP entry: ${name}`)
    totalBytes += uncompressedSize
    if (totalBytes > maxTotalBytes) throw new Error('The archive is too large to restore')
    const raw = buffer.subarray(dataStart, dataEnd)
    let data: Buffer
    if (method === 0) {
      data = Buffer.from(raw)
    } else if (method === 8) {
      data = inflateRawSync(raw)
    } else {
      throw new Error(`Unsupported ZIP compression in ${name}`)
    }
    if (data.length !== uncompressedSize) throw new Error(`Invalid ZIP entry size: ${name}`)
    if (crc32(data) !== crc) throw new Error(`ZIP checksum mismatch: ${name}`)
    entries.push({
      name: name.replace(/\\/g, '/'),
      data,
      directory: name.endsWith('/')
    })
  }
  return entries
}
