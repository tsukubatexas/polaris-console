# ADR 0002: Backend Owns Polaris Authentication

## Status

Accepted.

## Context

Polaris clients commonly use bearer tokens or OAuth2 client credentials. Putting those credentials into browser storage would make the console easier to misuse and harder to secure.

## Decision

The browser only receives an HTTP-only session cookie. The backend stores bearer tokens, OAuth client credentials, access tokens, and token expiry in the session store.

## Consequences

- Browser code cannot directly leak Polaris credentials through localStorage or frontend state.
- The backend can enforce allowed target hosts.
- Horizontal production deployments need a shared session backend or sticky sessions.
