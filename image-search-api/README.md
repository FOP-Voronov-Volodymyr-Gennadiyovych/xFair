# Framefinder

A full-stack JavaScript image search abstraction layer backed by Wikimedia
Commons. It includes a responsive browser interface, paginated JSON results,
and a persistent log of recent searches.

## Run locally

```bash
npm start
```

The server listens on `http://localhost:3000` by default. Set `PORT` or
`RECENT_FILE` to override the listener port or recent-search storage path.

## API

- `GET /query/:search?page=1` returns image, thumbnail, description, and source
  page URLs.
- `GET /recent/` returns the 20 most recently submitted search queries.
- `GET /health` returns the service health status.

## Test

```bash
npm test
```
