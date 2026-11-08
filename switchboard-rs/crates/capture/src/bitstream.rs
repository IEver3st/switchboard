use crate::video::nal_units;

#[derive(Default)]
pub struct HevcHeaders {
    pub vps: Vec<u8>,
    pub sps: Vec<u8>,
    pub pps: Vec<u8>,
}

pub fn hevc_annexb_to_lengths(data: &[u8], out: &mut Vec<u8>, headers: &mut HevcHeaders) -> bool {
    out.clear();
    let mut irap = false;
    for nal in nal_units(data) {
        if nal.len() < 2 {
            continue;
        }
        match (nal[0] >> 1) & 0x3f {
            32 => replace(&mut headers.vps, nal),
            33 => replace(&mut headers.sps, nal),
            34 => replace(&mut headers.pps, nal),
            35 => {}
            t => {
                if (16..=21).contains(&t) {
                    irap = true;
                }
                out.extend_from_slice(&(nal.len() as u32).to_be_bytes());
                out.extend_from_slice(nal);
            }
        }
    }
    irap
}

fn replace(slot: &mut Vec<u8>, nal: &[u8]) {
    if slot != nal {
        *slot = nal.to_vec();
    }
}

fn unescape(nal: &[u8], limit: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(limit);
    let mut zeros = 0;
    for &b in nal {
        if out.len() >= limit {
            break;
        }
        if zeros >= 2 && b == 3 {
            zeros = 0;
            continue;
        }
        zeros = if b == 0 { zeros + 1 } else { 0 };
        out.push(b);
    }
    out
}

pub fn hvcc(vps: &[u8], sps: &[u8], pps: &[u8]) -> Vec<u8> {
    let raw = unescape(sps, 15);
    let ptl = if raw.len() >= 15 { &raw[3..15] } else { &[0x01, 0x60, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 0x5d][..] };
    let first = raw.get(2).copied().unwrap_or(0);
    let sub_layers = ((first >> 1) & 0x07) + 1;
    let nested = first & 0x01;
    let mut b = vec![1u8];
    b.extend_from_slice(ptl);
    b.extend_from_slice(&[0xf0, 0x00, 0xfc, 0xfd, 0xf8, 0xf8, 0x00, 0x00]);
    b.push((sub_layers << 3) | (nested << 2) | 0x03);
    b.push(3);
    for (kind, nal) in [(32u8, vps), (33, sps), (34, pps)] {
        b.push(0x80 | kind);
        b.extend_from_slice(&1u16.to_be_bytes());
        b.extend_from_slice(&(nal.len() as u16).to_be_bytes());
        b.extend_from_slice(nal);
    }
    b
}

const OBU_SEQUENCE_HEADER: u8 = 1;
const OBU_TEMPORAL_DELIMITER: u8 = 2;
const OBU_PADDING: u8 = 15;

fn leb128(data: &[u8]) -> Option<(u64, usize)> {
    let mut value = 0u64;
    for (i, &b) in data.iter().take(8).enumerate() {
        value |= ((b & 0x7f) as u64) << (7 * i);
        if b & 0x80 == 0 {
            return Some((value, i + 1));
        }
    }
    None
}

fn write_leb128(mut v: u64, out: &mut Vec<u8>) {
    loop {
        let byte = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

pub fn av1_temporal_unit(data: &[u8], out: &mut Vec<u8>, seq: &mut Vec<u8>) -> bool {
    out.clear();
    let mut has_seq = false;
    let mut pos = 0;
    while pos < data.len() {
        let header = data[pos];
        let kind = (header >> 3) & 0x0f;
        let ext = header & 0x04 != 0;
        let has_size = header & 0x02 != 0;
        let head_len = 1 + ext as usize;
        if pos + head_len > data.len() {
            break;
        }
        let (payload_len, size_len) = if has_size {
            match leb128(&data[pos + head_len..]) {
                Some(v) => (v.0 as usize, v.1),
                None => break,
            }
        } else {
            (data.len() - pos - head_len, 0)
        };
        let start = pos + head_len + size_len;
        let end = (start + payload_len).min(data.len());
        let payload = &data[start..end];
        if kind != OBU_TEMPORAL_DELIMITER && kind != OBU_PADDING {
            let mut obu = Vec::with_capacity(head_len + 8 + payload.len());
            obu.push(header | 0x02);
            if ext {
                obu.push(data[pos + 1]);
            }
            write_leb128(payload.len() as u64, &mut obu);
            obu.extend_from_slice(payload);
            if kind == OBU_SEQUENCE_HEADER {
                has_seq = true;
                if *seq != obu {
                    *seq = obu.clone();
                }
            }
            out.extend_from_slice(&obu);
        }
        pos = end;
    }
    has_seq
}

struct Bits<'a> {
    data: &'a [u8],
    pos: usize,
}

impl Bits<'_> {
    fn f(&mut self, n: usize) -> u64 {
        let mut v = 0;
        for _ in 0..n {
            let byte = self.data.get(self.pos / 8).copied().unwrap_or(0);
            v = (v << 1) | ((byte >> (7 - self.pos % 8)) & 1) as u64;
            self.pos += 1;
        }
        v
    }

    fn uvlc(&mut self) -> u64 {
        let mut zeros = 0;
        while self.f(1) == 0 && zeros < 32 {
            zeros += 1;
        }
        if zeros >= 32 { u64::MAX } else { self.f(zeros) + (1 << zeros) - 1 }
    }
}

pub fn av1c(seq_obu: &[u8]) -> Vec<u8> {
    let header = seq_obu.first().copied().unwrap_or(0);
    let mut start = 1 + (header & 0x04 != 0) as usize;
    if header & 0x02 != 0 {
        start += leb128(seq_obu.get(start..).unwrap_or(&[])).map_or(0, |v| v.1);
    }
    let mut r = Bits { data: seq_obu.get(start..).unwrap_or(&[]), pos: 0 };
    let profile = r.f(3) as u8;
    let _still = r.f(1);
    let reduced = r.f(1) == 1;
    let (level, tier) = if reduced {
        (r.f(5) as u8, 0u8)
    } else {
        let timing = r.f(1) == 1;
        let mut decoder_model = false;
        let mut delay_len = 0;
        if timing {
            r.f(32);
            r.f(32);
            if r.f(1) == 1 {
                r.uvlc();
            }
            decoder_model = r.f(1) == 1;
            if decoder_model {
                delay_len = r.f(5) as usize + 1;
                r.f(32);
                r.f(5);
                r.f(5);
            }
        }
        let display_delay = r.f(1) == 1;
        let points = r.f(5) as usize + 1;
        let mut first = None;
        for _ in 0..points {
            r.f(12);
            let level = r.f(5) as u8;
            let tier = if level > 7 { r.f(1) as u8 } else { 0 };
            if decoder_model && r.f(1) == 1 {
                r.f(delay_len);
                r.f(delay_len);
                r.f(1);
            }
            if display_delay && r.f(1) == 1 {
                r.f(4);
            }
            first.get_or_insert((level, tier));
        }
        first.unwrap_or((8, 0))
    };
    let mut b = vec![0x81, (profile << 5) | (level & 0x1f), (tier << 7) | 0b0000_1100, 0];
    b.extend_from_slice(seq_obu);
    b
}
