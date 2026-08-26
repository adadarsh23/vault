import { describe, it, expect } from 'vitest';
import { searchVaultItems, getTranscriptSnippet } from '../fuzzy';
import { VaultItem } from '../storage';

describe('Searchable Transcripts in Vault', () => {
  const mockTypeConfigs = {
    audio: { label: 'Audio' },
    video: { label: 'Video' },
    photo: { label: 'Photo' },
  };

  const sampleItems: VaultItem[] = [
    {
      id: 'audio-memo-1',
      type: 'audio',
      title: 'Voice Note Oct 12.webm',
      content: new Uint8Array([1, 2, 3]),
      createdAt: 1697000000000,
      updatedAt: 1697000000000,
      metadata: {
        size: 1048576,
        isLiveCapture: true,
        hasVoiceClarity: true,
        voiceClarityPreset: 'crystal',
        transcript:
          'In this sprint planning meeting we finalized the zero knowledge encryption protocol and decided to launch on Friday morning.',
      },
    },
    {
      id: 'video-interview-2',
      type: 'video',
      title: 'Interview_Candidate_Alex.mp4',
      content: new Uint8Array([4, 5, 6]),
      createdAt: 1697005000000,
      updatedAt: 1697005000000,
      metadata: {
        size: 52428800,
        isLiveCapture: true,
        transcript:
          'Alex explained their experience designing distributed Web Audio digital signal processing pipelines and noise gate filters.',
      },
    },
    {
      id: 'photo-doc-3',
      type: 'photo',
      title: 'Architecture_Diagram.jpg',
      content: new Uint8Array([7, 8, 9]),
      createdAt: 1697010000000,
      updatedAt: 1697010000000,
      metadata: {
        size: 2097152,
      },
    },
  ];

  it('should find audio and video items when searching for spoken words in their transcripts', () => {
    // Search for a word only present in audio-memo-1's transcript
    const resultMemo = searchVaultItems(sampleItems, 'encryption protocol', mockTypeConfigs);
    expect(resultMemo.length).toBe(1);
    expect(resultMemo[0].item.id).toBe('audio-memo-1');
    expect(resultMemo[0].transcriptSnippet).toBeDefined();
    expect(resultMemo[0].transcriptSnippet).toContain('encryption protocol');
    expect(resultMemo[0].transcriptMatches).toBeDefined();
    expect(resultMemo[0].transcriptMatches!.length).toBeGreaterThan(0);

    // Search for a word only present in video-interview-2's transcript
    const resultVideo = searchVaultItems(sampleItems, 'signal processing', mockTypeConfigs);
    expect(resultVideo.length).toBe(1);
    expect(resultVideo[0].item.id).toBe('video-interview-2');
    expect(resultVideo[0].transcriptSnippet).toContain('signal processing');
  });

  it('should generate properly truncated context snippet around matched query words', () => {
    const longTranscript =
      'The morning began with an overview of quantum cryptography algorithms. Later in the afternoon, we discussed the Merkle Tree verification steps in detail before concluding with database replication.';

    const snippetObj = getTranscriptSnippet(longTranscript, 'Merkle Tree', 20);
    expect(snippetObj.snippet).toContain('Merkle Tree');
    expect(snippetObj.snippet.length).toBeLessThan(longTranscript.length);
  });

  it('should support multi-word search queries matched across transcripts', () => {
    const results = searchVaultItems(sampleItems, 'distributed filters', mockTypeConfigs);
    expect(results.length).toBe(1);
    expect(results[0].item.id).toBe('video-interview-2');
  });
});
