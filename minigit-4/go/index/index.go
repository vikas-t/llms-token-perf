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
	Ctime     int64
	CtimeNano int32
	Mtime     int64
	MtimeNano int32
	Dev       uint32
	Ino       uint32
	Mode      uint32
	Uid       uint32
	Gid       uint32
	Size      uint32
	SHA       string
	Flags     uint16
	Name      string
}

// Index represents the staging area
type Index struct {
	Entries map[string]*IndexEntry
}

// NewIndex creates a new empty index
func NewIndex() *Index {
	return &Index{
		Entries: make(map[string]*IndexEntry),
	}
}

// ReadIndex reads the index file
func ReadIndex(repoRoot string) (*Index, error) {
	indexPath := filepath.Join(repoRoot, ".minigit", "index")
	if !utils.FileExists(indexPath) {
		return NewIndex(), nil
	}

	data, err := utils.ReadFile(indexPath)
	if err != nil {
		return nil, err
	}

	return parseIndex(data)
}

func parseIndex(data []byte) (*Index, error) {
	if len(data) < 12 {
		return NewIndex(), nil
	}

	// Verify signature
	if string(data[:4]) != IndexSignature {
		return nil, fmt.Errorf("invalid index signature")
	}

	version := binary.BigEndian.Uint32(data[4:8])
	if version != IndexVersion {
		return nil, fmt.Errorf("unsupported index version: %d", version)
	}

	entryCount := binary.BigEndian.Uint32(data[8:12])
	idx := &Index{Entries: make(map[string]*IndexEntry)}

	pos := 12
	for i := uint32(0); i < entryCount; i++ {
		if pos+62 > len(data) {
			return nil, fmt.Errorf("truncated index")
		}

		entry := &IndexEntry{}
		entry.Ctime = int64(binary.BigEndian.Uint32(data[pos:]))
		entry.CtimeNano = int32(binary.BigEndian.Uint32(data[pos+4:]))
		entry.Mtime = int64(binary.BigEndian.Uint32(data[pos+8:]))
		entry.MtimeNano = int32(binary.BigEndian.Uint32(data[pos+12:]))
		entry.Dev = binary.BigEndian.Uint32(data[pos+16:])
		entry.Ino = binary.BigEndian.Uint32(data[pos+20:])
		entry.Mode = binary.BigEndian.Uint32(data[pos+24:])
		entry.Uid = binary.BigEndian.Uint32(data[pos+28:])
		entry.Gid = binary.BigEndian.Uint32(data[pos+32:])
		entry.Size = binary.BigEndian.Uint32(data[pos+36:])

		// SHA is 20 bytes
		entry.SHA = fmt.Sprintf("%x", data[pos+40:pos+60])

		entry.Flags = binary.BigEndian.Uint16(data[pos+60:])
		nameLen := int(entry.Flags & 0xFFF)

		pos += 62

		// Read name (null-terminated)
		if pos+nameLen > len(data) {
			return nil, fmt.Errorf("truncated index entry name")
		}
		entry.Name = string(data[pos : pos+nameLen])
		pos += nameLen

		// Skip null terminator and padding (align to 8 bytes)
		entryLen := 62 + nameLen + 1
		padding := (8 - (entryLen % 8)) % 8
		pos += 1 + padding

		idx.Entries[entry.Name] = entry
	}

	return idx, nil
}

// WriteIndex writes the index to disk
func WriteIndex(repoRoot string, idx *Index) error {
	indexPath := filepath.Join(repoRoot, ".minigit", "index")

	data, err := serializeIndex(idx)
	if err != nil {
		return err
	}

	return utils.WriteFile(indexPath, data, 0644)
}

func serializeIndex(idx *Index) ([]byte, error) {
	var buf bytes.Buffer

	// Collect and sort entries
	var names []string
	for name := range idx.Entries {
		names = append(names, name)
	}
	sort.Strings(names)

	// Header
	buf.WriteString(IndexSignature)
	binary.Write(&buf, binary.BigEndian, uint32(IndexVersion))
	binary.Write(&buf, binary.BigEndian, uint32(len(names)))

	// Entries
	for _, name := range names {
		entry := idx.Entries[name]

		binary.Write(&buf, binary.BigEndian, uint32(entry.Ctime))
		binary.Write(&buf, binary.BigEndian, uint32(entry.CtimeNano))
		binary.Write(&buf, binary.BigEndian, uint32(entry.Mtime))
		binary.Write(&buf, binary.BigEndian, uint32(entry.MtimeNano))
		binary.Write(&buf, binary.BigEndian, entry.Dev)
		binary.Write(&buf, binary.BigEndian, entry.Ino)
		binary.Write(&buf, binary.BigEndian, entry.Mode)
		binary.Write(&buf, binary.BigEndian, entry.Uid)
		binary.Write(&buf, binary.BigEndian, entry.Gid)
		binary.Write(&buf, binary.BigEndian, entry.Size)

		// SHA (20 bytes)
		shaBytes := make([]byte, 20)
		fmt.Sscanf(entry.SHA, "%x", &shaBytes)
		buf.Write(shaBytes)

		// Flags (name length in lower 12 bits)
		nameLen := len(entry.Name)
		if nameLen > 0xFFF {
			nameLen = 0xFFF
		}
		binary.Write(&buf, binary.BigEndian, uint16(nameLen))

		// Name (null-terminated with padding)
		buf.WriteString(entry.Name)
		buf.WriteByte(0)

		// Padding to align to 8 bytes
		entryLen := 62 + len(entry.Name) + 1
		padding := (8 - (entryLen % 8)) % 8
		for i := 0; i < padding; i++ {
			buf.WriteByte(0)
		}
	}

	// SHA-1 checksum
	content := buf.Bytes()
	h := sha1.New()
	h.Write(content)
	checksum := h.Sum(nil)

	buf.Write(checksum)

	return buf.Bytes(), nil
}

// AddEntry adds or updates an entry in the index
func (idx *Index) AddEntry(name, sha string, mode uint32, fileInfo os.FileInfo) {
	entry := &IndexEntry{
		Name: name,
		SHA:  sha,
		Mode: mode,
	}

	if fileInfo != nil {
		entry.Mtime = fileInfo.ModTime().Unix()
		entry.MtimeNano = int32(fileInfo.ModTime().Nanosecond())
		entry.Ctime = entry.Mtime
		entry.CtimeNano = entry.MtimeNano
		entry.Size = uint32(fileInfo.Size())
	}

	entry.Flags = uint16(len(name))
	if entry.Flags > 0xFFF {
		entry.Flags = 0xFFF
	}

	idx.Entries[name] = entry
}

// RemoveEntry removes an entry from the index
func (idx *Index) RemoveEntry(name string) {
	delete(idx.Entries, name)
}

// GetEntry returns an entry by name
func (idx *Index) GetEntry(name string) *IndexEntry {
	return idx.Entries[name]
}

// GetSortedEntries returns all entries sorted by name
func (idx *Index) GetSortedEntries() []*IndexEntry {
	var names []string
	for name := range idx.Entries {
		names = append(names, name)
	}
	sort.Strings(names)

	var entries []*IndexEntry
	for _, name := range names {
		entries = append(entries, idx.Entries[name])
	}
	return entries
}

// Clear removes all entries
func (idx *Index) Clear() {
	idx.Entries = make(map[string]*IndexEntry)
}

// HasEntry checks if an entry exists
func (idx *Index) HasEntry(name string) bool {
	_, ok := idx.Entries[name]
	return ok
}
