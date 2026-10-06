# Notes

## Assumptions
- (e.g. only the search endpoint matters; pageSize max of 100 is reasonable)

## Fixes
### 1. Search query AND/OR precedence
- Problem / how I found it / what I changed / why

### 2. Artificial Thread.sleep
...
### 3. Input validation (status, page, pageSize)
...
### 4. Frontend loading/error state, page reset, debounce + abort
...

## Not done / remaining risks
- Pagination is still in memory (loads all rows, then slices)
- `%` and `_` in search are not escaped
- No automated tests
- H2 console enabled and CORS hardcoded for dev