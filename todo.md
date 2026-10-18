# TODO

Deferred work, to pick up after the POC. Plans and decisions live in `docs/`.

## Tests

### `packages/api/src/services/brandDataSource.service.test.ts` (not created yet)

Fixtures: `BRAND_ID`, `INVALID_ID`, `DEFAULT_DATA_SOURCE` (`url: null`, 30000 / 3 / 7),
`CONFIGURED_URL` (`http://localhost:4000/mock-data-source/orders`), `fakeDataSourceRow(overrides)`
(snake_case row), `queryMock` / `fakePool` / `beforeEach(mockReset)` as in `brand.service.test.ts`.

**`getBrandDataSource`**
- [ ] G1 invalid brand id → `ValidationError`, query not called
- [ ] G2 no row → `NotFoundError` "Brand does not exist."
- [ ] G3 not configured → returns `DEFAULT_DATA_SOURCE` with `url: null`
- [ ] G4 configured → snake_case row mapped to camelCase record
- [ ] G5 SQL has `FROM brand_data_sources` and `WHERE brand_id = $1`, values `[BRAND_ID]`

**`updateBrandDataSource`**: validation cases must not call the query
- [ ] U1 invalid brand id → `ValidationError`
- [ ] U2 `{}` → `ValidationError`
- [ ] U3 unknown field `{ timeoutMS: 5000 }` → `ValidationError`
- [ ] U4 `{ refetchDays: 1.5 }` → `ValidationError`
- [ ] U5 out of range (`it.each`): `timeoutMs` 999 / 120001, `refetchDays` -1, `maxChunkDays` 0 / 93 → `ValidationError`
- [ ] U6 url `ftp://…`, `https://user:pass@host/x`, `https://host/x#frag` → `ValidationError`
- [ ] U7 url `https://host:99999/x` → `ValidationError` "Invalid URL." (proves `assertValidUrl` is called)
- [ ] U8 `{ timeoutMs: 5000 }` → SQL has `timeout_ms = $1` and no other column assignments; values `[5000, BRAND_ID]`
- [ ] U9 all four fields → four assignments; values `[url, timeoutMs, refetchDays, maxChunkDays, BRAND_ID]`
- [ ] U10 SQL has `updated_at = now()`
- [ ] U11 SQL has `WHERE bds.brand_id = $2` for a one-field update
- [ ] U12 returns the updated record
- [ ] U13 `rowCount 0` → `NotFoundError` "Brand does not exist."

### Route tests
- [ ] Route-level tests were removed on purpose, to learn writing them later (Fastify `inject`).

## API

- [ ] `pgErrors.ts`: add `CHECK_VIOLATION` (`23514`) + `isCheckViolation`; map to `ValidationError` by constraint name, never echo PostgreSQL's `detail` (it contains the whole failing row).
- [ ] Admin UI: "Data source" dialog per brand (`GET` / `PATCH /brands/:brandId/data-source`), "Not configured" when `url` is `null`, friendly message for the url pattern instead of the raw regex.

## Security / hardening (roadmap H1)

- [ ] HTTPS-only data source URLs in production (check removed for the POC; plain `http` sends orders incl. `customerId` unencrypted). Consider a per-environment setting.
- [ ] Data source authentication, when a real source needs it: store only a secret **reference**, never the secret; never return or log it.
- [ ] Audit log for data source config changes (who, when, from/to).

## Housekeeping

- [x] ~~`customerId` normalisation~~: decided 18 Oct 2026, stored as received; `""`, `null` and missing all mean "no customer".
