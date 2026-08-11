# confused-bb

This fork keeps personal features separate from upstream bb.

## Remotes

- `origin` is `git@github.com:ltl-baauer/confused-bb.git`.
- `upstream` is `https://github.com/get-bb/bb.git`.

Run `./confused/sync-upstream` to merge and test the latest upstream `main`.
Add `--push` to push the tested merge to the fork.

## Custom features

- `extensions/notes` contains the standalone Notes plugin. It does not change bb core files.
- The Glass desktop release uses small release-channel and renderer seams.
- Glass controls live in separate components and modules where possible.

## Notes plugin

```sh
cd extensions/notes
npm ci
npm run typecheck
npm run build
bb plugin install "$PWD" --yes
```

## Glass build

```sh
BB_DESKTOP_RELEASE_CHANNEL=glass pnpm --filter @bb/desktop package
```

The build creates `apps/desktop/release/mac-arm64/bb Glass.app`.
