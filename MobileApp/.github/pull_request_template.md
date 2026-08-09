<!--
Choose ONE template section below that matches your PR type.
Delete the sections you don't need, keeping only the relevant template.
-->

## PR Type Selection
**Select the type of change (check one):**
- [ ] 🎯 **Feature** - New capability or functionality
- [ ] 🐛 **Bug Fix** - Fixing incorrect behavior  
- [ ] 🔧 **Refactor** - Code restructuring without behavior change
- [ ] ✅ **Test** - Adding or updating tests
- [ ] 📝 **Documentation** - Documentation updates only
- [ ] 🏗️ **Chore** - Build process, dependencies, or maintenance

**After selecting your PR type above, keep ONLY the corresponding template section below and delete the rest.**

------------------------------------------------------------
<!-- ====== Always Required ====== -->

## Summary
<!-- Summary/Description of the changes made in this PR -->

## Related Issues
<!-- "Closes #<n>" for automatic closure. separate multiple with commas -->
Closes #4, #5, #6

------------------------------------------------------------

<!-- ====== NEW FEATURE TEMPLATE ====== -->

## Design Overview
- **Core idea:** 
- **Data structures / algorithms:** 
- **Interfaces added/changed:** 

## Implementation Notes
Key decisions, trade-offs, alternative approaches rejected.

## Testing Evidence
- Added tests: <!-- list files -->
- Manual verification steps:

## Documentation
- [ ] README updated
- [ ] Design doc added/updated
- [ ] Code comments added

## Checklist (Feature-Specific)
- [ ] Issue(s) linked (or rationale if none)
- [ ] Tests added and passing
- [ ] No Lint / Style violations
- [ ] No dead / Debug / Commented-Out code
- [ ] Follows course integrity guidelines

------------------------------------------------------------

<!-- ====== BUGFIX/PATCH TEMPLATE ====== -->

## Problem
Describe the defect / incorrect behavior.

## Root Cause Analysis
Brief explanation of underlying issue.
- **Symptom:**
- **Root cause:**
- **Why now / trigger:**

## Fix Description
What changed and why it resolves the issue.

## Testing Evidence
- Added tests: <!-- list files -->
- Manual verification steps:

## Checklist
- [ ] Root cause clearly identified
- [ ] Fix tested and verified
- [ ] No new warnings introduced
- [ ] Docs updated

------------------------------------------------------------

<!-- ====== REFACTOR/PERFORMANCE TEMPLATE ====== -->

## Intent/Motivation/Rationale
Why refactor? (clarity, reuse, testability, performance groundwork, etc.)

## Scope
Modules / Files / Components affected

## Updates/Changes
- **Before:** 
- **After:** 
- **Key improvements:** 

## Checklist
- [ ] No functional change intended
- [ ] All existing tests pass unchanged
- [ ] Docs / Comments updated to reflect new structure
- [ ] Dead code removed
- [ ] Behavior equivalence verified

------------------------------------------------------------

<!-- ====== TEST TEMPLATE ====== -->

## Test Additions / Changes
- **New test files:** 
- **Modified tests:** 
- **Removed tests (if any):** 

## Coverage / Scenarios
List critical paths / edge cases exercised:
- Edge case 1:
- Edge case 2:
- Edge case 3:

## Checklist (Test-Specific)
- [ ] Tests are deterministic (no random failures)
- [ ] Edge cases covered
- [ ] No redundant overlapping tests
- [ ] Test names are descriptive

------------------------------------------------------------

<!-- ====== DOCUMENTATION TEMPLATE ====== -->

## Scope of Documentation Change
- [ ] README
- [ ] Wiki pages
- [ ] Code Comments / Docstrings
- [ ] Diagrams / images

## Motivation
Why was this update needed?

## Content Summary
List major additions/updates 

## Verification
- [ ] Markdown renders correctly
- [ ] Links verified and working
- [ ] Diagrams / images display properly
- [ ] No typos / grammar issues
- [ ] Removed stale/outdated sections
- [ ] Consistent formatting and style

------------------------------------------------------------

## Additional Notes (Optional - Keep if needed)
<!-- Risks, assumptions, rollback plan, reviewer guidance, etc. -->
