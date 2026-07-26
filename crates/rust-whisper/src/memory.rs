use crate::host_imports;

const PAGE_SIZE: usize = 65536; // 64 KB per page
const PAGE_MASK: u32 = 0xFFFF;
const PAGE_SHIFT: u32 = 16;
const MMIO_BASE: u32 = 0xFFFF0000;

pub struct Memory {
    pages: Vec<Option<Box<[u8; PAGE_SIZE]>>>,
    pub brk_ptr: u32,
}

impl Memory {
    pub fn new() -> Self {
        let mut pages = Vec::with_capacity(65536);
        pages.resize_with(65536, || None);
        Self {
            pages,
            brk_ptr: 0x1000000, // 16 MB default heap start
        }
    }

    #[inline(always)]
    fn get_or_create_page(&mut self, page_idx: usize) -> &mut [u8; PAGE_SIZE] {
        if self.pages[page_idx].is_none() {
            self.pages[page_idx] = Some(Box::new([0u8; PAGE_SIZE]));
        }
        self.pages[page_idx].as_mut().unwrap()
    }

    #[inline(always)]
    fn get_page(&self, page_idx: usize) -> Option<&[u8; PAGE_SIZE]> {
        self.pages[page_idx].as_deref()
    }

    pub fn read_u8(&self, addr: u32) -> u8 {
        if addr >= MMIO_BASE {
            return (host_imports::js_read_mmio(addr, 1) & 0xFF) as u8;
        }
        let page_idx = (addr >> PAGE_SHIFT) as usize;
        let offset = (addr & PAGE_MASK) as usize;
        match self.get_page(page_idx) {
            Some(page) => page[offset],
            None => 0,
        }
    }

    pub fn write_u8(&mut self, addr: u32, val: u8) {
        if addr >= MMIO_BASE {
            host_imports::js_write_mmio(addr, 1, val as u32);
            return;
        }
        let page_idx = (addr >> PAGE_SHIFT) as usize;
        let offset = (addr & PAGE_MASK) as usize;
        let page = self.get_or_create_page(page_idx);
        page[offset] = val;
    }

    pub fn read_u16(&self, addr: u32) -> u16 {
        if addr >= MMIO_BASE {
            return (host_imports::js_read_mmio(addr, 2) & 0xFFFF) as u16;
        }
        if addr & 1 == 0 {
            let page_idx = (addr >> PAGE_SHIFT) as usize;
            let offset = (addr & PAGE_MASK) as usize;
            if offset + 1 < PAGE_SIZE {
                if let Some(page) = self.get_page(page_idx) {
                    return u16::from_le_bytes([page[offset], page[offset + 1]]);
                }
                return 0;
            }
        }
        let b0 = self.read_u8(addr) as u16;
        let b1 = self.read_u8(addr.wrapping_add(1)) as u16;
        b0 | (b1 << 8)
    }

    pub fn write_u16(&mut self, addr: u32, val: u16) {
        if addr >= MMIO_BASE {
            host_imports::js_write_mmio(addr, 2, val as u32);
            return;
        }
        if addr & 1 == 0 {
            let page_idx = (addr >> PAGE_SHIFT) as usize;
            let offset = (addr & PAGE_MASK) as usize;
            if offset + 1 < PAGE_SIZE {
                let page = self.get_or_create_page(page_idx);
                let bytes = val.to_le_bytes();
                page[offset] = bytes[0];
                page[offset + 1] = bytes[1];
                return;
            }
        }
        let bytes = val.to_le_bytes();
        self.write_u8(addr, bytes[0]);
        self.write_u8(addr.wrapping_add(1), bytes[1]);
    }

    pub fn read_u32(&self, addr: u32) -> u32 {
        if addr >= MMIO_BASE {
            return host_imports::js_read_mmio(addr, 4);
        }
        if addr & 3 == 0 {
            let page_idx = (addr >> PAGE_SHIFT) as usize;
            let offset = (addr & PAGE_MASK) as usize;
            if offset + 3 < PAGE_SIZE {
                if let Some(page) = self.get_page(page_idx) {
                    return u32::from_le_bytes([
                        page[offset],
                        page[offset + 1],
                        page[offset + 2],
                        page[offset + 3],
                    ]);
                }
                return 0;
            }
        }
        let b0 = self.read_u8(addr) as u32;
        let b1 = self.read_u8(addr.wrapping_add(1)) as u32;
        let b2 = self.read_u8(addr.wrapping_add(2)) as u32;
        let b3 = self.read_u8(addr.wrapping_add(3)) as u32;
        b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
    }

    pub fn write_u32(&mut self, addr: u32, val: u32) {
        if addr >= MMIO_BASE {
            host_imports::js_write_mmio(addr, 4, val);
            return;
        }
        if addr & 3 == 0 {
            let page_idx = (addr >> PAGE_SHIFT) as usize;
            let offset = (addr & PAGE_MASK) as usize;
            if offset + 3 < PAGE_SIZE {
                let page = self.get_or_create_page(page_idx);
                let bytes = val.to_le_bytes();
                page[offset] = bytes[0];
                page[offset + 1] = bytes[1];
                page[offset + 2] = bytes[2];
                page[offset + 3] = bytes[3];
                return;
            }
        }
        let bytes = val.to_le_bytes();
        self.write_u8(addr, bytes[0]);
        self.write_u8(addr.wrapping_add(1), bytes[1]);
        self.write_u8(addr.wrapping_add(2), bytes[2]);
        self.write_u8(addr.wrapping_add(3), bytes[3]);
    }

    pub fn read_bytes(&self, addr: u32, len: usize) -> Vec<u8> {
        let mut buf = vec![0u8; len];
        for i in 0..len {
            buf[i] = self.read_u8(addr.wrapping_add(i as u32));
        }
        buf
    }

    pub fn write_bytes(&mut self, addr: u32, bytes: &[u8]) {
        for (i, &b) in bytes.iter().enumerate() {
            self.write_u8(addr.wrapping_add(i as u32), b);
        }
    }
}
