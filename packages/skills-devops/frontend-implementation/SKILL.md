---
name: "frontend-implementation"
description: "Implements frontend components following project conventions."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# frontend-implementation

Build a UI component that fits the project it lives in. The right answer is almost never "the way I would have done it on a blank slate."

## When to use

- User asks to build a component, page, or UI feature
- User provides a design (Figma, screenshot, wireframe, description) to implement
- User wants to wire up state management, routing, or data fetching for a UI
- User wants help finishing a half-built UI component
- User asks to add a form, modal, table, or interactive element
- User wants to integrate a UI library or component system
- User needs responsive layout or accessibility work on an existing component

## When NOT to use

- User wants to design the UI (wireframes, mockups, information architecture) -- use a design skill
- User wants backend API work that happens to serve a frontend -- use an API/backend skill
- User wants to debug a specific frontend bug -- use `debugging`
- User wants only CSS/styling changes with no component logic
- User wants to set up the frontend build system or framework from scratch

## Procedure

1. **Read existing component patterns.** Before writing a single line, understand the project's conventions by examining:
   - **File layout:** Where do components live? Is it `src/components/`, `app/`, feature folders? Are there barrel exports (`index.ts`)?
   - **State management:** Redux, Zustand, Jotai, Context, local state, server state (React Query, SWR)? Do not introduce a new state library.
   - **Styling:** CSS modules, Tailwind, styled-components, Sass, plain CSS? Match exactly. Do not mix approaches.
   - **Forms:** Controlled, uncontrolled, React Hook Form, Formik? Match the pattern used in other forms.
   - **Routing:** Next.js App Router, Pages Router, React Router, TanStack Router? Understand the routing convention.
   - **Data fetching:** Where does data loading happen? Loaders, useEffect, server components, hooks? Match the pattern.
   - **Component style:** Functional vs. class (almost certainly functional). Props interface style. Default export vs. named export. Co-located types or separate.
   - **Testing:** What test framework? What rendering approach? What assertion style? Look at 2-3 existing test files.

   Spend real time on this step. Reading 5 existing components takes 2 minutes and saves 20 minutes of rework.

2. **Confirm the brief.** Before implementing, make sure you understand:
   - **States:** What are all the visual states? (empty, loading, loaded, error, disabled, selected, hover, focus)
   - **Interactions:** What does the user click, type, drag, submit? What happens on each action?
   - **Data:** What data does this component need? Where does it come from? What is the shape?
   - **Placement:** Where does this component appear in the page/layout hierarchy? What is its parent?
   - If the brief is ambiguous, ask. Do not guess at requirements.

3. **Pick the smallest seam.** Start with the minimal component that renders something visible:
   - Static markup with hardcoded data first
   - Then add real data/props
   - Then add interactions
   - Then add edge case handling
   - This lets you and the user validate direction early before investing in complexity.

4. **Write the component matching conventions.** Build the component following every convention identified in step 1:
   - Use the same file naming pattern (`PascalCase.tsx`, `kebab-case.tsx`, whatever the project uses)
   - Use the same import style (absolute paths, aliases, relative)
   - Use the same prop definition style (inline type, separate interface, destructured in args)
   - Use the same hook patterns (custom hooks in `hooks/`, co-located, etc.)
   - Match indentation, quote style, semicolons -- or let the project's formatter handle it
   - If the project has a component library or design system, use its primitives. Do not build a custom button if `<Button>` exists.

5. **Handle non-happy states.** Every component that loads data or accepts input needs:
   - **Loading state:** Skeleton, spinner, or placeholder. Match what other components in the project do.
   - **Error state:** User-friendly message with retry option. Never show raw error objects to users.
   - **Empty state:** What shows when there is no data? "No results" with a call to action is better than a blank screen.
   - **Disabled state:** If the component can be disabled, show it visually and prevent interaction.
   - **Boundary errors:** Wrap with an error boundary if the component could crash (data-dependent rendering).

6. **Wire it in.** Connect the component to the rest of the application:
   - **Data:** Hook up to the API/store/context. Use the project's data fetching pattern.
   - **Routing:** Add route if this is a new page. Update navigation if needed.
   - **Parent component:** Import and render in the parent. Pass required props.
   - **Types:** Ensure type safety end-to-end. No `any` types. No `as` casts unless truly necessary.
   - Verify the component renders in the actual application, not just in isolation.

7. **Add minimal tests.** Write tests that match the project's testing patterns:
   - Test that the component renders without crashing
   - Test the primary user interaction (click, submit, toggle)
   - Test loading and error states if the component fetches data
   - Use the same rendering approach as existing tests (`render()`, `screen.getByRole()`, etc.)
   - Do not over-test implementation details. Test behavior, not internal state.

8. **Flag concerns.** Before presenting the work, note any:
   - Accessibility gaps (missing labels, keyboard navigation, screen reader issues)
   - Performance risks (large lists without virtualization, heavy re-renders, large bundle impact)
   - Missing responsive behavior (does it work on mobile?)
   - Hardcoded values that should be configurable
   - Deviations from the brief that you made intentionally

9. **Verify in browser.** If the user can run the app:
   - Ask them to check the component visually
   - Test keyboard navigation (Tab, Enter, Escape)
   - Test at different viewport sizes
   - Check dark mode if the project supports it

10. **Watch network and console.** Check the browser dev tools:
    - **Network tab:** Are there unnecessary requests? N+1 API calls? Missing caching?
    - **Console:** Any warnings? React key warnings, deprecated API usage, unhandled promise rejections?
    - **Performance:** Any obvious jank? Components re-rendering on every keystroke?
    - Fix anything you find before presenting the final result.

## Key Rules

- Match the project. Do not introduce new patterns, libraries, or conventions.
- Handle loading, error, and empty states. Always. No exceptions.
- No `any` types. No `// @ts-ignore`. If the types are hard, the design might be wrong.
- Test behavior, not implementation. "When user clicks submit, the form data is sent" not "useState is called with X."
- When in doubt about a design decision, ask the user. Do not make UX choices silently.
- Accessibility is not optional. Labels, roles, keyboard navigation, focus management.

## Output Format

Return the implemented component(s) with: file paths, key design decisions made, states handled, tests added, and any concerns or follow-up items flagged.
