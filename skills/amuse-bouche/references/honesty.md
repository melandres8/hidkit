# Honesty rules

A landing page makes claims. Each claim MUST be true, and each example MUST look like an example.

## Claims

- Use only the claims that the owner states, or that the user gives you.
- When the old site is the source, quote it in the spec, with the place where it appears.
- Do not invent offers, prices, guarantees, client names, or results.
- When a call to action leads to a flow, name the real flow, such as "sign up". Do not invent a new offer.

## Numbers

- Mark each number as real or as an example.
- Each example number MUST carry a visible label, such as "example" or "ejemplo", next to it.
- A calculator gives a range and calls it an estimate.

## Private data

- Do not show the phone number, the address, the citizenship, or the plans of the user. Show them only when the user asks.
- Do not link a private repository.

## Pitch mode

Use pitch mode when the user does not own the site. The design spec MUST hold these rules for the build:

- A visible notice says that the page is a redesign concept by the user. It also says that the user is not affiliated with the owner.
- The page sends `noindex, nofollow` in a meta tag.
- Every form is inert and says so. A form with `action="#"` still sends a request. Use a form that does not submit, such as `method="dialog"`.
- The page does not copy the domain name. It does not pretend to be the real site.
- The signature is the name that the user gave.
- The deliverables are the ones that the user chose, such as a live link and a before and after video.
- The spec MUST NOT plan to publish the concept on a host that the owner could confuse with their own.
