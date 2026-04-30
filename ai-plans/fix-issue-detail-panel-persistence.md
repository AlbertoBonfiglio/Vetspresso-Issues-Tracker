# Fix Plan: Issue Detail Panel Edit Persistence

## Problem Statement

When users open an issue in the Issue Detail Panel and attempt to edit fields (description, status, assignee, tags, versions, etc.), the data entered does not persist. The UI may appear to save (showing toast notifications), but upon closing and reopening the panel, or when external changes occur, the edits are lost.

## Root Cause Analysis

Based on code review of `src/panels/IssueDetailPanel.ts`, `src/services/IssueService.ts`, and `src/database/IssueDatabase.ts`, the following critical issues were identified:

### 1. Race Condition in `isSelfUpdate` Flag (HIGH PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 81-89, 98-189

**Issue**: The `isSelfUpdate` flag is set synchronously at the start of `handleMessage()` but the database update (`await this.service.updateIssue()`) is async. The `onIssueChanged` event fires after the async write completes, but the timing relative to the `finally` block (which resets `isSelfUpdate = false`) is non-deterministic.

**Flow Analysis**:
```
1. User clicks Save → Webview sends message
2. handleMessage() sets isSelfUpdate = true
3. await service.updateIssue() begins
4. Database writes to storage (async)
5. Database fires _onIssueChanged.fire() 
6. Panel's listener checks if (!this.isSelfUpdate) → HTML rebuild?
7. finally block sets isSelfUpdate = false
```

The event in step 5 may fire before or after step 7 depending on microtask scheduling. If it fires after, the HTML rebuilds and wipes form state.

### 2. External Changes Wipe Unsaved Form Data (HIGH PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 81-89

**Issue**: When another panel, command, or external process updates the same issue, the `onIssueChanged` event fires with `isSelfUpdate = false`, triggering a full HTML rebuild via `buildHtml()`. This completely regenerates the DOM, destroying any unsaved user input in form fields.

**Scenario**:
1. User opens Issue #5, starts typing in description textarea
2. User hasn't clicked Save yet (description is "draft")
3. Another command updates Issue #5 (e.g., adds a comment)
4. `onIssueChanged` fires → HTML rebuilds
5. User's draft description is lost

### 3. No Dirty State Tracking (MEDIUM PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 197-671 (entire HTML/JS)

**Issue**: The panel tracks no state about which fields have been modified. The webview uses `dataset.prevValue` for some fields (lines 588-594, 615-618) but this is incomplete and doesn't prevent HTML rebuilds from wiping data.

### 4. Optimistic UI Without Rollback (MEDIUM PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 480-500, 535-570

**Issue**: For tags, the webview updates `currentTags` array and re-renders chips BEFORE receiving confirmation from the extension. If `handleMessage` throws an error (lines 184-186), the UI shows the old data in the rebuilt HTML, but there's no explicit rollback mechanism.

### 5. Incomplete Error Handling (LOW PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 663-668, 184-186

**Issue**: The webview listens for error messages but only shows a toast. There's no synchronization of the full issue state after an error, which could leave the UI showing stale or incorrect data.

### 6. `update()` Method Rebuilds HTML (MEDIUM PRIORITY)

**Location**: `IssueDetailPanel.ts` lines 92-96

**Issue**: The `update()` method called from `show()` (line 41) always rebuilds HTML. If a panel is already open and being edited, calling `show()` again for the same issue will wipe form state.

## Proposed Solution

### Phase 1: Fix Race Condition (CRITICAL)

**Change**: Replace boolean `isSelfUpdate` with a Set of pending update IDs or use a more robust synchronization mechanism.

**Implementation**:
```typescript
// Instead of boolean flag, track the specific update promise
private pendingUpdate: Promise<void> | null = null;
private lastUpdateTime: number = 0;

// In constructor, modify listener:
this.service.onIssueChanged((event) => {
  if (event.issue.id === this.issue.id) {
    this.issue = event.issue;
    // Only skip rebuild if we have a pending update for this specific change
    const isPending = this.pendingUpdate && Date.now() - this.lastUpdateTime < 1000;
    if (!isPending) {
      this.panel.title = `Issue #${event.issue.sequentialId}`;
      // Check if any form has dirty state before rebuilding
      if (!this.hasDirtyFields()) {
        this.panel.webview.html = this.buildHtml();
      } else {
        // Update issue reference but don't rebuild - show warning toast
        this.showExternalChangeWarning();
      }
    }
  }
});
```

### Phase 2: Implement Dirty State Tracking (CRITICAL)

**Change**: Add JavaScript-side dirty state tracking that survives HTML rebuilds using `vscode.setState()` / `vscode.getState()`.

**Implementation**:
```typescript
// Add to buildHtml script section:
const persistedState = vscode.getState() || {};
const dirtyFields = persistedState.dirtyFields || {};

// For each input, check if we have a dirty value
const descriptionValue = dirtyFields.description ?? ${JSON.stringify(i.description ?? '')};

// On any input change, mark dirty and persist:
element.addEventListener('input', (e) => {
  const state = vscode.getState() || {};
  state.dirtyFields = { ...(state.dirtyFields || {}), [fieldName]: e.target.value };
  vscode.setState(state);
});

// On successful save, clear dirty state:
function clearDirty(fieldName) {
  const state = vscode.getState() || {};
  delete state.dirtyFields?.[fieldName];
  vscode.setState(state);
}
```

### Phase 3: Add Save Confirmation / Conflict Resolution (MEDIUM)

**Change**: When external changes are detected while user has dirty fields, show a conflict resolution UI instead of silently overwriting.

**Implementation**:
```typescript
// In handleMessage, after successful save:
this.panel.webview.postMessage({ command: 'saveConfirmed', field: msg.command });

// In webview script, handle saveConfirmed:
window.addEventListener('message', (event) => {
  if (event.data?.command === 'saveConfirmed') {
    clearDirty(event.data.field);
    showToast('Saved successfully');
  }
  if (event.data?.command === 'externalChange') {
    // Show conflict banner
    showConflictWarning(event.data.issue);
  }
});
```

### Phase 4: Implement Partial Updates Instead of Full Rebuild (MEDIUM)

**Change**: Instead of rebuilding entire HTML on external changes, post a message to the webview with only the changed fields and let the webview update just those DOM elements.

**Implementation**:
```typescript
// Instead of rebuilding HTML:
// this.panel.webview.html = this.buildHtml();

// Send selective update:
this.panel.webview.postMessage({
  command: 'patchIssue',
  changes: { /* only changed fields */ }
});

// In webview, apply patches without wiping other fields
```

### Phase 5: Add Debouncing for Rapid Edits (LOW)

**Change**: For fields that save on blur/enter (assignee, versions), add debouncing to prevent race conditions with rapid successive edits.

**Implementation**:
```typescript
// Add debounce utility in webview
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Debounce the save operations
const debouncedSave = debounce((field, value) => {
  vscode.postMessage({ command: field, value });
}, 300);
```

## Implementation Order

1. **Phase 1** (Race Condition Fix) - Most critical, single point fix
2. **Phase 2** (Dirty State Tracking) - Required to prevent data loss
3. **Phase 3** (Save Confirmation) - Improves user experience
4. **Phase 4** (Partial Updates) - Performance and UX improvement
5. **Phase 5** (Debouncing) - Polish, prevents edge cases

## Testing Strategy

1. **Unit Tests**: Add tests for `IssueDetailPanel` message handling with mocked `vscode.WebviewPanel`
2. **Integration Tests**: Test rapid successive edits, concurrent modifications from multiple panels
3. **Manual Tests**:
   - Open issue, edit description, save, close, reopen - verify persistence
   - Open same issue in two panels, edit in both - verify conflict handling
   - Rapid edit/save cycles - verify no race conditions
   - Edit field without saving, trigger external change - verify draft preservation

## Files to Modify

1. `src/panels/IssueDetailPanel.ts` - Primary changes
2. `test/suite/issueDetailPanel.test.ts` - New test file (create if doesn't exist)

## Risk Assessment

- **High Risk**: Changes to `isSelfUpdate` logic could break synchronization between panels
- **Medium Risk**: Dirty state tracking adds complexity, potential memory leaks if state not cleared
- **Low Risk**: UI changes (toast messages, warnings) are cosmetic

## Rollback Plan

If issues arise:
1. Revert to current implementation
2. Apply minimal fix: remove `isSelfUpdate` boolean and always rebuild HTML (accepting data loss on external changes)
3. Document known limitation: "Don't edit same issue in multiple panels simultaneously"

---

**Plan Created**: 2026-04-30  
**Priority**: CRITICAL (data loss bug)  
**Estimated Effort**: 4-6 hours implementation + 2 hours testing
