## Tooling

- Use Node.js 16.x
- Use Rust (required for building executable)

### Install Node Dependencies

##### (_Required_)

- Use `npm install --legacy-peer-deps` to install dependencies.

<hr>

## How to Run:

1. Download Release [link]
2. Run From Source
3. Build From Source

#### Release Downloads:

- linux
- macosx
- windows

<br>
<hr>

# Run from Source:

##### Compile the Project:

- Use `npm run build`

##### Run Source:

- Use `npm run start`
<br>

<hr>

# Local Configuration Override

Place a `local-config.json` in the working directory (the directory from which the CLI is launched) to replace the on-chain RemoteConfig entirely at startup.

### Behaviour

- **Optional**: when `local-config.json` is absent, the app fetches config from the on-chain contract as usual.
- **Complete replacement**: when present and valid, it fully replaces the on-chain RemoteConfig — it is **not** merged with on-chain values.
- **Validation**: the file must be valid JSON matching the full `RemoteConfig` shape. A valid-JSON file with an invalid shape (wrong types, missing required fields) is rejected with a structured warning and the app falls through to the on-chain path.
- **Provider overrides**: `twallet.config.json` provider overrides still apply later and retain their existing precedence.
- **Empty address allow list**: the allow list remains empty (no address restriction) regardless of local config. Trusted fee signer behaviour is separate and untouched.

### Example

See `local-config.json.example` in the repository root. It is a full `RemoteConfig` replacement that includes operational Waku peer multiaddrs and trusted fee signer values.

### Operator audit required

The example file contains **real public Waku multiaddrs and trusted fee signer keys**. Before using it in any environment:

1. **Review all `additionalDirectPeers` entries** — verify the multiaddrs point to peers you trust.
2. **Review all `trustedFeeSigner` entries** — verify the keys belong to signers you intend to trust.
3. **Remove or replace** any entries you do not need or recognise.
4. **Do not merge** the example with on-chain config — it replaces on-chain config entirely. If you only need to add peers, copy the on-chain values as a starting point and add your overrides.

<hr>

# Build Executable from Source:

#### 1. Install Rust Dependencies

- Use `cargo install nj-cli` to install compilation dependencies.

#### 2. Build Executable

- Use `npm run ship`

#### 3. Run Executable

- Use `cd build`
- Use `./terminal-wallet-cli` (_might need to chmod+x_)
<br>

<hr>

# Verify Releases & Source:
Each Release will include the sha256 hashes of the binary archives. As well as a GPG signed certificate of the verification hashes. Also included are GPG signed certs. of the included Source Code as well.
**./PUBLICSIGNER.asc contains the signer GPG public key**
**Please import this key into your gpg keychain if you wish to verify signed messages**

Navigate to the directory in which you downloaded the releases.

##### Specific Downloads:
- Open SHA256SUMS.sha, copy the line(s) for the release(s) you've downloaded.
- Use `echo "<copied hash & filename>" | sha256sum --check`
<br>

###### Example: 
```sh
---SHA256SUMS.sha---
84a5fafd21fa21f8b3ef8bd10a18a8f1c7bbcabb67477d8d6dc5d609c84b4187  release-1.0.0-linux.tar.gz
ce93915c196698a15d957a27df586b7cdf72d499eb597b19136a9148fa1eaab7  release-1.0.0-macos.tar.gz
c697d422472ebd78b388a6f3389a4659eb3f3af9a2c0380ee73c2194c1e816cf  release-1.0.0-win.tar.gz

``` 
***(These hashes will be out of date. DO NOT use these examples. They are purely for visual representation. Refer to the hashes found within the SHA256SUMS.sha provided with each release.)***

```sh
#User: Downloaded Linux Version.
#User: Validates Singular Hash
echo "84a5fafd21fa21f8b3ef8bd10a18a8f1c7bbcabb67477d8d6dc5d609c84b4187  release-1.0.0-linux.tar.gz" | sha256sum --check
#Console Output: 
release-1.0.0-linux.tar.gz: OK
```
<br>

##### All Files:
- Use `sha256sum --check SHA256SUMS.sha`
