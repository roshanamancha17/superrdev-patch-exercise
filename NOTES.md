# Notes

## How I worked
I ran the app, reproduced each problem through the UI, the API and the backend
logs, then read the code to find the root cause. I used AI tools to speed up
reading and to review my reasoning. I verified every fix by re-running the same
check that exposed the problem.

## Assumptions
- Archived tasks should never appear in search results.
- A status filter should always narrow results, whether or not a search term is set.
- Invalid client input should return 400, not 500.
- A maximum page size of 100 is reasonable for an internal tool.
- The Oracle file is a reference artifact, so I kept its logic consistent with the Java/H2 fix but did not run it.

## Fixes

### 1. AND/OR precedence in the search query (highest impact)
- **Issue:** Search returned archived tasks, and the status filter was ignored.
- **How I found it:** `?q=api&pageSize=100` returned 10 results including archived tasks (ids 20, 21). `?q=api&status=DONE` returned OPEN and IN_PROGRESS tasks. In the UI, selecting "Open" still showed IN_PROGRESS rows. The Hibernate log showed the SQL had no parentheses.
- **Root cause:** SQL evaluates AND before OR, so `archived = FALSE AND title LIKE ? OR description LIKE ? AND status...` was read as `(archived = FALSE AND title LIKE ?) OR (description LIKE ? AND status...)`. Title matches skipped the status check, and description matches skipped the archived check.
- **Change:** Wrapped the two LIKE conditions in parentheses in `TaskRepository.java`, `db/queries/search_tasks.sql`, and both queries in the Oracle package.
- **Why:** Parentheses make the intended logic explicit: not archived AND (title or description matches) AND (status matches). After the fix, `?q=api` returns 8 results with no archived tasks, and `?q=api&status=DONE` returns none (the only DONE matches were archived).

### 2. Artificial delay in the controller
- **Issue:** Every search was slow, and shorter queries were slower.
- **How I found it:** The backend log printed `complexity=8/9/10` for queries of 2, 1 and 0 characters, and requests visibly lagged.
- **Root cause:** `Thread.sleep((10 - query.length()) * 100)` blocked the request thread for up to 1 second. It was labelled "complexity estimation for logging" but did nothing useful.
- **Change:** Removed the sleep and the unused variables, and simplified the log line.
- **Why:** It added up to a second of latency per request and tied up server threads for no benefit.

### 3. Input validation (status, page, pageSize)
- **Issue:** `?status=banana` and `?page=0` returned a 500 error page.
- **How I found it:** I tried invalid values in the browser and got the Whitelabel 500 page.
- **Root cause:** `TaskStatus.valueOf` throws on unknown values, and `page=0` made the `subList` start index negative. `pageSize` had no upper limit.
- **Change:** Catch the invalid status and return 400 with a JSON error. Clamp `page >= 1` and `1 <= pageSize <= 100`.
- **Why:** Bad client input should get a clear 4xx response, not look like a server failure, and an unbounded page size could return huge responses.

### 4. Frontend: stuck states, page reset, debounce and stale requests
- **Issue:**
  - After one failed request the UI stayed on "Loading tasks..." and the error never cleared.
  - Going to page 3 and then searching showed "No tasks found" with no pager.
  - Every keystroke fired a request, and a slow old response could overwrite a newer one.
- **How I found it:** I reproduced the empty-page trap by paging and then searching. I read `useTasks.js` and saw the `.catch` never called `setLoading(false)` and `error` was never reset.
- **Change:**
  - `useTasks.js`: `setLoading(false)` on error, clear `error` at the start of each request, 300 ms debounce on the query, and an `AbortController` that cancels the previous request.
  - `App.jsx`: reset to page 1 when the query or status changes, and use one `PAGE_SIZE` constant instead of the hardcoded `10`.
  - `api.js`: accept an abort signal, and remove the noisy `console.log`.
- **Why:** These make the UI recover from errors, avoid the dead-end empty page, send fewer requests, and ensure the screen always shows the response to the latest input.

## Not done / remaining risks
- Pagination still happens in memory: the backend loads every matching row and then slices it. It works for 49 rows, but should use database-level paging (`Pageable` or `LIMIT/OFFSET`) at scale.
- `%` and `_` in the search term are not escaped, so they act as wildcards.
- No automated tests. With more time I would add controller tests for the search, status and validation cases.
- H2 console enabled, `show-sql` on, and CORS hardcoded to localhost, which are fine for dev but not for deployment.
- The entity is exposed directly as JSON instead of through a DTO.
- Oracle package changes were not executed locally.