# Trust requests on Devices

Status: implemented (PR #57, merge `f1447b2`)

## Problem Statement

A person reviewing their devices cannot see incoming Trust Requests in the context of their current Device Identity and Trusted Devices. They have to go to a separate Requests view to review and decide a request, making the relationship between the requesting device and the device network less apparent.

## Solution

Show a **Trust requests** card on Devices, between the current device identity card and Trusted Devices, whenever there are active incoming Trust Requests. Each request includes the requesting Device Name, full Peer ID, request sent time and controls to approve or reject it. Hide the card when the authoritative request list is available and empty. Follow the approved phone, tablet and desktop mockup, while preserving the real application's behavior and established design.

## User Stories

1. As a device owner, I want to see active Trust Requests on Devices, so that I can review them alongside my device network.
2. As a device owner, I want the requests card between my current identity and Trusted Devices, so that its position reflects the decision I am making.
3. As a device owner with no active requests, I want no empty requests card, so that the screen remains focused.
4. As a device owner, I want the card titled “Trust requests”, so that it uses the project's terminology.
5. As a device owner, I want the card to begin directly with request details, so that I can review it without introductory text.
6. As a device owner, I want to see the requesting Device Name, so that I can recognize the device asking to join.
7. As a device owner, I want the full Peer ID and a clear label for it, so that I can distinguish similarly named Device Identities.
8. As a device owner, I want to see when a request was sent, so that I can distinguish recent requests.
9. As a device owner, I want to approve a request from its entry, so that I can admit a device without leaving Devices.
10. As a device owner, I want to reject a request from its entry, so that I can decline an unwanted device.
11. As a device owner, I want to see all concurrent requests separately, so that I can make an independent decision for each device.
12. As a device owner, I want the request count to reflect the visible active requests, so that I know how many need attention.
13. As a device owner, I want a handled or expired request to disappear when authoritative state changes, so that the list stays current.
14. As a device owner, I want the last request's card to disappear once there are no active requests, so that Devices returns to its normal layout.
15. As a device owner, I want a request that is being decided to show progress and prevent duplicate decisions, so that I do not submit conflicting actions.
16. As a device owner, I do not want decision feedback text rendered on the screen after I approve or reject a request.
17. As a device owner, I want a replaced or expired request guarded against stale approval, so that I do not act on an outdated request.
18. As a device owner, I want request loading or failure to be distinguishable from an empty list, so that I do not assume no requests exist when their state is unknown.
19. As a notification recipient, I want the existing notification to open an appropriate in-app review of its request, so that I can still respond from a notification.
20. As a person using a phone, I want readable request details and touch-friendly controls, so that I can make a decision without horizontal page scrolling.
21. As a person using a tablet, I want the same details and actions to fit the available space, so that the screen is comfortable to use.
22. As a person using a desktop, I want the card to fit the Devices layout alongside the existing navigation, so that it feels native to Clipp.
23. As a keyboard or assistive-technology user, I want named controls, readable details and useful feedback, so that I can review and decide each request independently.
24. As a user with an unavailable or initializing Device Identity, I want decision controls to remain safe and recovery to remain available, so that an unsafe action is not offered.
25. As a device owner, I want my current identity and existing Trusted Devices actions to keep working, so that adding the card does not interrupt device management.

## Implementation Decisions

- Use the existing shared Devices UI and its established visual system; follow the hosted mockup as the reference for order, content, action hierarchy and responsive intent. Keep the actual application's Clipp menu icon and shell. The mockup's preview controls, sample devices, IDs and times are not product features or data.
- The card uses the heading “Trust requests” with a count derived from the authoritative active incoming collection. It has no explanatory paragraph under its heading. Place it after the current Device Identity and before Trusted Devices at all supported widths.
- Show each initiator's self-reported Device Name, the complete authenticated Peer ID and a clearly labeled request sent time, plus “Approve” and “Reject” actions. Do not truncate the Peer ID without an accessible way to view the entire value. Adapt the actions and wrapping to the available width without losing details.
- The current shared pending-request projection carries a request version but no sent timestamp. Expose the validated signed request's issued time to the shared UI through the appropriate core/runtime projections and all affected Electron, Chrome extension and Android bridges. Preserve integer validation and handle invalid or unrepresentable presentation values honestly; never invent a time or substitute the expiry or receipt time. Display a localized, unambiguous date/time, with a usable fallback when unavailable.
- Render the card only for active incoming requests; distinguish an authoritative empty list from loading, unavailable or identity-unready state. Preserve visible recovery and retry paths when the list is unknown rather than silently presenting that state as a verified zero. Do not create an empty requests card solely to represent zero.
- Reuse the existing decision behavior, version guard, per-request pending state and owner/identity lifecycle. Do not optimistically claim Admission or remove a request before authoritative state confirms its disposition. Do not render decision feedback messages; retain loading and request-list recovery information.
- Support multiple independent initiators and newer coalesced requests. A decision applies only to the currently displayed request version; a replacement, expiry, identity change or unavailable authority must not result in a stale decision. Preserve existing revalidation and notification dismissal semantics.
- Remove the separate Requests destination. Selecting an incoming Trust Request notification opens Devices, preserving notification acknowledgement, recovery and return-to-task behavior. Keep previously issued request destinations compatible as routing intents, but render no Requests tab. Present outgoing Pairing status on Devices.
- Preserve Peer ID as the authoritative identity, the exact signed request envelope, freshness rules and best-effort Trust Response semantics. Acceptance, response delivery and eventual Membership Reconciliation are distinct facts. No protocol, authorization, durable outgoing-request or relay behavior changes are intended.
- Support keyboard use, clear accessible labels for each request's actions, visible focus, progress and error announcements, and layouts that remain usable in narrow windows and on Android, extension and Electron.

## Testing Decisions

- Test observable behavior through the existing mounted shared UI and runtime callbacks, not component structure or private implementation details. This is the primary seam approved by the user.
- Extend existing device-management, Trust Request decision and notification-journey UI behavior tests. Cover placement, labels and full details; one and multiple requests; approve and reject; authoritative empty, loading and unavailable states; expiry or replacement; pending operations; absence of decision feedback; identity changes; and notification navigation.
- Verify independently that a decision or expiration affects only the relevant request, that the last authoritative removal hides the card, and that decision feedback is not rendered. Verify existing identity and trusted-device controls remain usable.
- Add targeted tests at existing core/runtime projection and bridge seams only where necessary to carry the validated issued time, including all affected runtimes and boundary handling for unrepresentable values. Reuse the existing pairing validation and version guard tests rather than duplicating protocol internals in UI tests.
- Check phone, tablet and desktop layouts in a real browser at representative widths, including keyboard access, full Peer ID availability, touch targets and no horizontal page overflow. Qualify relevant native/runtime behavior under the project's runtime acceptance profiles where applicable; a browser mockup alone does not prove native behavior.
- Run the repository's appropriate verification for changed surfaces, including its required pre-commit check before any code commit.

## Out of Scope

- Redesigning the general device-management workflow or unrelated notification types.
- Pairing protocol, signature, timing-window, Admission, Membership Reconciliation, transport or relay policy changes.
- Adding request cancellation, new notification actions, invented verification codes, or bulk approval.
- Shipping mockup-only viewport switches, reset controls, sample data or the hosted preview as part of Clipp.

## Further Notes

The reference is the private [interactive mockup](https://clipp-trust-request-preview.attentivemarmot.chatgpt.site), including its phone, tablet and desktop views. The sample request times are design data, not a source of truth. The accepted pairing-and-trust specification and ADRs 0004, 0005 and 0006 remain authoritative where the mockup omits behavior. No implementation or runtime acceptance is implied by this specification.
