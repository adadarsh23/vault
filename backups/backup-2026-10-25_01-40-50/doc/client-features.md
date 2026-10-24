# 💻 Frontend Architecture & Client Features (`doc/client-features.md`)

This document explores the client-side architecture, user experience innovations, state management topology, and privacy safeguards implemented in **Vault**'s React 19 frontend.

---

## 1. Frontend Architecture & Component Topology

Vault's frontend is constructed on **React 19**, **Vite**, **TypeScript 5.8**, and **Tailwind CSS 4**, leveraging a decoupled state machine architecture:

```mermaid
flowchart TD
    subgraph UI ["User Interface Layer"]
        Layout["Vault Dashboard & Navigation Layout"]
        VaultModules["14 Specialized Vault Compartments"]
        GlobalPiP["Global Video Mini-Player (PiP Engine)"]
        PrivacyShield["PDF Viewer & Privacy Shield"]
        EmergencyModal["Emergency Wipe & Duress Triggers"]
    end

    subgraph State ["State Management Layer (Zustand 5)"]
        VaultStore["vaultStore (Items, Categories, Filters)"]
        AuthStore["authStore (User, Passkeys, Session State)"]
        PiPStore["videoMiniPlayerStore (PiP Position, Playback, Speed)"]
        SyncStore["syncStore (Socket.IO Connection, Queue, Delta)"]
    end

    subgraph WorkerTier ["Cryptographic Web Worker Tier"]
        ArgonWorker["Argon2id KDF Web Worker (hash-wasm)"]
        CryptoWorker["AES-256-GCM / VCAS01 Streaming Worker"]
        MerkleWorker["Merkle Tree Tamper Detection Engine"]
    end

    subgraph CacheTier ["Local Persistence Tier (Client-Side)"]
        IDB[("IndexedDB Local Encrypted Cache")]
        RAM["Protected Ephemeral RAM Handles"]
    end

    Layout --> VaultModules & GlobalPiP & PrivacyShield & EmergencyModal
    VaultModules <--> VaultStore
    GlobalPiP <--> PiPStore
    PrivacyShield <--> VaultStore
    EmergencyModal --> AuthStore

    VaultStore <--> RAM
    VaultStore <--> IDB
    VaultStore <--> CryptoWorker
    AuthStore <--> ArgonWorker
    VaultStore <--> SyncStore
```

---

## 2. TipTap 3.32 Rich Text Editor & Live Note Encryption

Vault integrates **TipTap 3.32** (built on the ProseMirror document model) in `src/features/vault/NotesVault.tsx` to deliver an encrypted rich text editor with native Markdown support:

```mermaid
flowchart TD
    UserInput["User Keystrokes & Formatting"] --> TipTap["TipTap Editor Engine"]
    TipTap --> JSON["ProseMirror JSON Doc / Markdown"]
    JSON --> Debounce["Debounced Autosave (300ms)"]
    Debounce --> CryptoWorker["Web Worker: AES-256-GCM / VCAS01 Encryption"]
    CryptoWorker --> Store["Zustand vaultStore + IndexedDB Cache"]
    Store --> RemoteSync["Sync Pipeline (HTTPS / Socket.IO)"]
```

### Key Capabilities:

- **Markdown Shortcuts**: Type `# `, `## `, `**bold**`, `> `, `- [ ]`, or `---` to trigger formatting instantly.
- **Rich Extensions**: Inline highlighting, embedded tables with cell splitting and insertion, task lists, code blocks with syntax highlighting, and encrypted image embedding.
- **Client-Side Autosave**: Changes are serialized and encrypted in a dedicated Web Worker on a 300ms debounce loop, ensuring zero UI stutter and immediate persistence to IndexedDB before remote delta sync.

---

## 3. Global Floating Video Mini-Player (Picture-in-Picture)

Vault features a persistent, floating video player (`GlobalVideoMiniPlayer`) that remains active across view transitions, navigation, and folder browsing.

```mermaid
stateDiagram-v2
    [*] --> Standalone: Video clicked in media vault
    Standalone --> Floating: User navigates to notes, passwords, or files
    Floating --> Minimized: User clicks collapse button
    Minimized --> Floating: User clicks expand button
    Floating --> Standalone: User taps full view button
    Floating --> Closed: User closes player or locks vault
```

### Architectural Highlights (`videoMiniPlayerStore.ts` & `GlobalVideoMiniPlayer.tsx`):

- **Global State Isolation**: Managed via Zustand (`videoMiniPlayerStore`), preserving playback position, volume, playback speed (0.5x to 2.0x), and visual filter settings across route changes.
- **Picture-in-Picture Modes**: Supports browser-native PiP API alongside an in-DOM floating overlay with drag positioning and edge snapping.
- **Visual Filters**: Real-time canvas filters: Grayscale, Contrast Enhancement, Sepia, Invert, and Night-Vision presets.
- **Encrypted Media Streaming**: Streams chunked media directly from encrypted blob streams via signed HMAC URLs without downloading whole video files first.

---

## 4. Sandboxed PDF & Document Privacy Shield

Viewing sensitive documents (passports, financial statements, contracts) in a web browser introduces vulnerabilities: shoulder surfing, screenshot snooping, and window switching previews.

Vault implements a multi-tier **Privacy Shield** (`PdfViewer.tsx` and `useAntiScreenshotAndShield.ts`):

```mermaid
flowchart TD
    subgraph Triggers ["System Triggers"]
        TabSwitch["Tab Switch (document.visibilityState == 'hidden')"]
        WindowBlur["Window Blur (window.onblur)"]
        PrintKey["Ctrl+P / Command+P Keystroke"]
        ScreenshotKey["PrintScreen / Screenshot Shortcut"]
    end

    subgraph DefenseEngine ["Privacy Shield Defense Engine"]
        BlurFilter["Instant CSS Gaussian Blur (30px)"]
        Watermark["Dynamic User Identity Watermark"]
        PrintShield["@media print { display: none !important }"]
        CanvasBlock["Canvas Hardware Masking"]
    end

    TabSwitch --> BlurFilter
    WindowBlur --> BlurFilter
    PrintKey --> PrintShield
    ScreenshotKey --> CanvasBlock
```

### Privacy Protections:

- **Tab-Switch Blurring**: The instant a user switches tabs or minimizes the window, the document viewer applies a 30px CSS blur and black masking layer to prevent OS-level preview caching.
- **Anti-Screenshot Deterrence**: Displays an animated watermark displaying authenticated username, timestamp, and device fingerprint.
- **Print Prevention**: Suppresses print shortcuts and injects print media CSS clearing DOM rendering during print dialog invocation.

---

## 5. Audio Vault & Waveform Visualizer (`AudioVault.tsx`)

- **Voice Memo Recording**: Direct in-browser encrypted recording using Web Audio API and MediaRecorder without creating unencrypted temporary files on disk.
- **Real-Time Waveform Visualizer**: Live HTML5 Canvas rendering of frequency bars and audio amplitudes during recording and playback.
- **Playback Controls**: Variable speed playback (0.5x to 2.0x), waveform scrub-to-seek, and looping.

---

## 6. Password Manager & Credential Security (`PasswordManager.tsx`)

- **Entropy & Strength Engine**: Real-time password scoring powered by **zxcvbn**, evaluating dictionary attacks, l33t-speak patterns, and spatial keyboards.
- **Breach Verification (k-Anonymity)**: Checks passwords against billions of breached credentials via HaveIBeenPwned API sending only the first 5 characters of the SHA-1 hash; full passwords never leave the client.
- **Password Generator**: Configurable cryptographic entropy generator (passphrases, length, symbols, numbers, character exclusion).
- **Auto-Clipboard Shredder**: Copied credentials auto-wipe from the system clipboard after 30 seconds.

---

## 7. Secrets & Key Recovery Management (`SecretsVault.tsx`)

- **BIP-39 Mnemonic Seed Generator**: Generates and verifies 12, 18, and 24-word cryptocurrency recovery phrases with standard checksum validation.
- **Key Partitioning**: Dedicated fields for SSH private keys, PGP keys, cloud API tokens, and Post-Quantum Kyber-768 key pairs.
- **One-Click Visibility Masking**: Sensitive fields are hidden behind masked asterisks by default with 5-second reveal timers.

---

## 8. Cards & Payment Methods Vault (`CardsVault.tsx`)

- **Luhn Algorithm Verification**: Automatic client-side checksum validation of credit/debit card numbers before saving.
- **Dynamic Card Brand Rendering**: Automatic card issuer detection (Visa, MasterCard, American Express, Discover, JCB) with tailored visual card themes.
- **CVV Privacy Shield**: CVV security codes remain obscured with optional toggle.

---

## 9. Contacts, Identities & Wi-Fi Vaults

- **Contacts Vault (`ContactsVault.tsx`)**: Encrypted personal contacts directory with search, relationship categorization, and standard vCard (`.vcf`) export.
- **Identities Vault (`IdentitiesVault.tsx`)**: Secure storage for passport numbers, national IDs, driver licenses, and tax IDs, with encrypted multi-page document attachment support.
- **Wi-Fi Vault (`WifiVault.tsx`)**: Network credentials (SSID, WPA2/WPA3 keys) with instant dynamic QR code generation for camera-based quick joining.

---

## 10. Location, Todo, Chat & Other Files Vaults

- **Location Vault (`LocationVault.tsx`)**: Encrypted geographic coordinates, physical addresses, altitude, and one-click navigation links to OpenStreetMap and Google Maps.
- **Todo & Tasks Vault (`TodoVault.tsx`)**: Encrypted task manager with priority tags (Urgent, High, Medium, Low), checklists, and completion timestamps. Fully verified by automated security test suites.
- **Chat Vault (`ChatVault.tsx`)**: Private encrypted messaging threads with configurable self-destruct timers (1 hour, 24 hours, 7 days).
- **Other Files Vault (`OtherFilesVault.tsx`)**: Arbitrary binary and document storage supporting files up to 500MB with drag-and-drop chunked uploads and SHA-256 verification.

---

## 11. Physical Coercion Defense & Decoy Vault Partition

```mermaid
flowchart TD
    LoginPrompt["Login Prompt"] --> PinCheck{"PIN Entered?"}
    PinCheck -->|Primary Passphrase| RealVault["Unlock Real Vault (All 14 Compartments)"]
    PinCheck -->|Duress Decoy PIN| DecoyTrigger["Duress Mode Triggered"]

    subgraph DuressSequence ["Duress Defense Sequence"]
        WipeRAM["1. Shred All Real Encryption Keys in RAM"]
        PurgeIDB["2. Purge Sensitive Session Caches"]
        MountDecoy["3. Mount Realistic Decoy Vault (Mock Files & Notes)"]
    end

    DecoyTrigger --> WipeRAM --> PurgeIDB --> MountDecoy
```

### Plausible Deniability Under Hostile Inspection:

- If a user is physically compelled to unlock their vault, entering the pre-configured **Duress PIN** instantly shreds real master keys in RAM and loads a realistic decoy partition populated with benign documents, receipts, and photos.
- The UI gives zero indication that decoy mode has been triggered.

---

## 12. Cross-Device Touch Drag-and-Drop Polyfill

Mobile browsers often struggle with HTML5 drag-and-drop. Vault incorporates a touch-optimized drag-and-drop system:

```mermaid
sequenceDiagram
    autonumber
    participant Touch as Touch Screen
    participant Engine as Touch Polyfill Engine
    participant Haptic as Device Haptic Vibration
    participant UI as Quick-Drop Bar & Folder Tree

    Touch->>Engine: TouchStart (Finger down on file)
    Engine->>Engine: Hold timer (>250ms triggers drag)
    Engine->>Haptic: Trigger subtle haptic pulse
    Engine->>UI: Render floating draggable ghost thumbnail
    Touch->>Engine: TouchMove across folders/categories
    Engine->>UI: Highlight target drop zone
    Touch->>Engine: TouchEnd (Release over target)
    Engine->>UI: Move item to category & trigger encrypted sync
```

This ensures desktop-class drag-and-drop fluidity on touch devices, iPads, and Android smartphones.
