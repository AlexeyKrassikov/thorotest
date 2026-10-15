# Test case IDs

The new-case form defaults to manual ID entry. Select **Automatic ID** for an
individual case to assign its ID on save. The choice resets for the next case.
Turning it off before saving restores the entered manual ID.

Automatic IDs use `TC-1`, `TC-2`, etc., globally across the instance. The next
number exceeds both the stored counter and existing numeric `TC-` IDs,
including imported IDs. Existing IDs are never changed. Deleted automatically
assigned numbers are not reused. Numbers are not guaranteed to be gapless.

API clients opt in with `auto_id: true` and omit `id` (or send null). Providing
both automatic mode and a nonempty manual ID returns 422. Requests without
`auto_id` retain their existing behavior, including random IDs when omitted.

The counter is stored in the database; migration `d2a7e9b40c61` creates its
table on application startup. No environment variable is required. Back up
the database before deploying, as with other schema updates.
