package index

import (
	"bytes"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	"minigit/utils"
	"os"
	"path/filepath"
	"sort"
)

const (
	IndexSignature = "DIRC"
	IndexVersion   = 2
)

// IndexEntry represents a single entry in the index
type IndexEntry struct {
	Ctime     uint32
	CtimeNano uint32
	Mtime     uint32
	MtimeNano uint32
	Dev       uint32
	Ino       uint32
	Mode      uint32
	Uid       uint32
	Gid       uint32
	Size      uint32
	SHA       [20]byte
	Flags     uint16
	Name      string
}

// Index represents the git index/staging area
type Index struct {
	Entries []IndexEntry
}

// NewIndex creates a new empty index
func NewIndex() *Index {
	return &Index{
		Entries: []IndexEntry{},
	}
}

// ReadIndex reads the index file from the repository
func ReadIndex(repoRoot string) (*Index, error) {
	indexPath := filepath.Join(utils.MinigitPath(repoRoot), "index")

	data, err := os.ReadFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return NewIndex(), nil
		}
		return nil, err
	}

	if len(data) < 12 {
		return NewIndex(), nil
	}

	// Check signature
	if string(data[:4]) != IndexSignature {
		return nil, fmt.Errorf("invalid index signature")
	}

	version := binary.BigEndian.Uint32(data[4:8])
	if version != IndexVersion {
		return nil, fmt.Errorf("unsupported index version: %d", version)
	}

	numEntries := binary.BigEndian.Uint32(data[8:12])
	idx := &Index{
		Entries: make([]IndexEntry, 0, numEntries),
	}

	pos := 12
	for i := uint32(0); i < numEntries; i++ {
		if pos+62 > len(data) {
			break
		}

		entry := IndexEntry{}
		entry.Ctime = binary.BigEndian.Uint32(data[pos:])
		entry.CtimeNano = binary.BigEndian.Uint32(data[pos+4:])
		entry.Mtime = binary.BigEndian.Uint32(data[pos+8:])
		entry.MtimeNano = binary.BigEndian.Uint32(data[pos+12:])
		entry.Dev = binary.BigEndian.Uint32(data[pos+16:])
		entry.Ino = binary.BigEndian.Uint32(data[pos+20:])
		entry.Mode = binary.BigEndian.Uint32(data[pos+24:])
		entry.Uid = binary.BigEndian.Uint32(data[pos+28:])
		entry.Gid = binary.BigEndian.Uint32(data[pos+32:])
		entry.Size = binary.BigEndian.Uint32(data[pos+36:])
		copy(entry.SHA[:], data[pos+40:pos+60])
		entry.Flags = binary.BigEndian.Uint16(data[pos+60:])

		nameLen := int(entry.Flags & 0x0FFF)
		pos += 62

		if pos+nameLen > len(data) {
			break
		}

		// Read name (null-terminated)
		nameEnd := pos + nameLen
		for nameEnd < len(data) && data[nameEnd] != 0 {
			nameEnd++
		}
		entry.Name = string(data[pos:nameEnd])
		pos = nameEnd + 1

		// Align to 8-byte boundary
		entryLen := 62 + len(entry.Name) + 1
		padding := (8 - (entryLen % 8)) % 8
		pos += padding

		idx.Entries = append(idx.Entries, entry)
	}

	return idx, nil
}

// WriteIndex writes the index to disk
func (idx *Index) WriteIndex(repoRoot string) error {
	// Sort entries by name
	sort.Slice(idx.Entries, func(i, j int) bool {
		return idx.Entries[i].Name < idx.Entries[j].Name
	})

	var buf bytes.Buffer

	// Write header
	buf.WriteString(IndexSignature)
	binary.Write(&buf, binary.BigEndian, uint32(IndexVersion))
	binary.Write(&buf, binary.BigEndian, uint32(len(idx.Entries)))

	// Write entries
	for _, entry := range idx.Entries {
		binary.Write(&buf, binary.BigEndian, entry.Ctime)
		binary.Write(&buf, binary.BigEndian, entry.CtimeNano)
		binary.Write(&buf, binary.BigEndian, entry.Mtime)
		binary.Write(&buf, binary.BigEndian, entry.MtimeNano)
		binary.Write(&buf, binary.BigEndian, entry.Dev)
		binary.Write(&buf, binary.BigEndian, entry.Ino)
		binary.Write(&buf, binary.BigEndian, entry.Mode)
		binary.Write(&buf, binary.BigEndian, entry.Uid)
		binary.Write(&buf, binary.BigEndian, entry.Gid)
		binary.Write(&buf, binary.BigEndian, entry.Size)
		buf.Write(entry.SHA[:])

		nameLen := len(entry.Name)
		if nameLen > 0x0FFF {
			nameLen = 0x0FFF
		}
		flags := uint16(nameLen)
		binary.Write(&buf, binary.BigEndian, flags)

		buf.WriteString(entry.Name)
		buf.WriteByte(0)

		// Pad to 8-byte boundary
		entryLen := 62 + len(entry.Name) + 1
		padding := (8 - (entryLen % 8)) % 8
		for i := 0; i < padding; i++ {
			buf.WriteByte(0)
		}
	}

	// Calculate and append checksum
	checksum := sha1.Sum(buf.Bytes())
	buf.Write(checksum[:])

	indexPath := filepath.Join(utils.MinigitPath(repoRoot), "index")
	return os.WriteFile(indexPath, buf.Bytes(), 0644)
}

// AddEntry adds or updates an entry in the index
func (idx *Index) AddEntry(entry IndexEntry) {
	// Remove existing entry with same name
	for i, e := range idx.Entries {
		if e.Name == entry.Name {
			idx.Entries = append(idx.Entries[:i], idx.Entries[i+1:]...)
			break
		}
	}
	idx.Entries = append(idx.Entries, entry)
}

// RemoveEntry removes an entry from the index by name
func (idx *Index) RemoveEntry(name string) bool {
	for i, e := range idx.Entries {
		if e.Name == name {
			idx.Entries = append(idx.Entries[:i], idx.Entries[i+1:]...)
			return true
		}
	}
	return false
}

// GetEntry returns an entry by name
func (idx *Index) GetEntry(name string) *IndexEntry {
	for i := range idx.Entries {
		if idx.Entries[i].Name == name {
			return &idx.Entries[i]
		}
	}
	return nil
}

// GetSHAHex returns the SHA as hex string
func (e *IndexEntry) GetSHAHex() string {
	return fmt.Sprintf("%x", e.SHA)
}

// SetSHAFromHex sets the SHA from a hex string
func (e *IndexEntry) SetSHAFromHex(sha string) error {
	if len(sha) != 40 {
		return fmt.Errorf("invalid SHA length: %d", len(sha))
	}
	for i := 0; i < 20; i++ {
		var b byte
		_, err := fmt.Sscanf(sha[i*2:i*2+2], "%02x", &b)
		if err != nil {
			return err
		}
		e.SHA[i] = b
	}
	return nil
}

// ModeToString returns the mode as a string
func (e *IndexEntry) ModeToString() string {
	return fmt.Sprintf("%06o", e.Mode)
}
