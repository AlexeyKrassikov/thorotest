# Projects and the Test Case Editor

## Projects and Collaborators

Select the active project above the workspace. Its folders and cases appear in
the library; creating a case or folder requires a project. The last selection is
remembered separately for each account in the browser.

An administrator creates projects in **Settings > Projects**. Open a project's
editor to add existing, approved users as collaborators:

Collaborators appear in the same user table used by Administration: display
name, email, username, project role and removal action. Membership changes save
immediately; the project name and description use the separate Save button.

| Project role | Permissions |
| --- | --- |
| Owner | Edit project settings, manage collaborators, edit folders and cases |
| Editor | Read and edit folders, cases and steps |
| Viewer | Read project data without modifying cases or folders |

Global administrators have access to every project. Other users need explicit
membership; a global tester/manager role does not make private cases public.
At least one project owner must remain. A project must be empty before deletion.
Project membership does not grant global administration privileges.

## Creating and Editing Cases

In **New test**, select a folder or enter a new folder name and press the adjacent
create button. The new folder belongs to the selected project and is immediately
selected. The author defaults to your username and can be changed. This label
does not change the authenticated actor recorded in the audit history.

In **Settings > Folders**, choose **Folder project** before creating a root
folder. The list and any new folders belong to that project; nested folders
inherit it. This selector does not move existing folders between projects.

The case title and ID remain in the header, with attributes in the right-hand
Details panel. **Edit**, next to **Delete**, opens the same form as case creation
to change the title, author, folder, priority, type, status, tags and configured
custom fields. The ID is read-only. **Save** applies these changes; cancelling
discards the draft after confirmation. Conflicts and save errors retain it.
Description, prerequisites and steps remain editable in the **Definition** tab.
Description and prerequisites sit above the steps, side by side on wide screens
and stacked on narrow screens.

Description, prerequisite and step edits save when a field loses focus. Enter in a
multiline field inserts a newline. The save indicator shows pending, saving and
saved states. On failure the local draft remains available for retry. If another
editor has changed the case, reload the server version before retrying; reloading
discards the local draft only after confirmation. Drafts are not persisted across
a browser refresh.

Steps support action/expected-result editing, addition, drag reordering and
up/down buttons for keyboard operation. Reordering saves immediately. Select
individual steps or all steps, then **Delete selected** and confirm. Removed
steps are retained internally when needed by historical execution results.

The **Changes** tab records old/new case values and ordered step contents with
the actual actor and timestamp. Saving unchanged values does not add a change
record. The editable author and the existing assignment/owner field are distinct.

## Personal Appearance

In **Settings > Profile > Appearance**, choose text size (14/16/18 px), interface
scale (100/110/125%) and compact or comfortable density. Preferences belong to
the account, survive login and do not change other users' interfaces. Existing
theme controls remain available. **Reset defaults** restores the initial values.
The density control in the existing Tweaks panel updates the same account
preference as the Profile page.

All new editor and project controls are available in English and Russian.

## API Clients

- Create cases/folders with `project_id`, or supply `X-Project-ID` as the active
  project header. Browser requests send the header automatically.
- `X-Project-ID` scopes test/folder queries; without it, clients can query cases
  across their permitted projects. It never grants membership.
- Manage collaborators with `GET /api/projects/{id}/members`,
  `GET /api/projects/{id}/candidates?search=...`,
  `PUT /api/projects/{id}/members/{user_id}` (`{"role":"editor"}`), and
  `DELETE /api/projects/{id}/members/{user_id}`.
- Read the case's `revision` and include it in `PATCH /api/tests/{id}`. A stale
  revision returns 409. For `PATCH /api/tests/{id}/steps`, send `X-Test-Revision`
  and the full ordered step array. Preserve existing step IDs; omit IDs only for
  new steps. Steps omitted from the array are removed from the active definition.
  The response includes the resulting revision in `X-Test-Revision`.
- Save account appearance with `PUT /api/me`, for example
  `{"appearance":{"textSize":16,"scale":110,"density":"comfortable"}}`.

## Deployment

No new environment variables are required. Back up the database before updating.
Startup runs migration `a6c3d8e9f102`, adding project membership, editor fields,
revision counters, appearance preferences and the archived-step flag.

The migration does not delete or relocate existing cases or folders, and does
not grant collaborators access automatically. Administrators can access legacy
records without a project through the API; they do not appear in a selected
project's library. Existing projects need explicit collaborator assignments.
Automated imports and case-creation clients must now provide a project context.

## Verification

```sh
python -m pytest backend/tests/test_project_workspace.py -q
npm run build
npm run test:i18n
npm run test:i18n:browser
```

The browser suite starts a disposable, demo-seeded database; it does not use the
production database.
