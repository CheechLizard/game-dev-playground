#!/usr/bin/env python3
"""Read the running game's MCP server with Python's standard library."""
import argparse
import json
import sys
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("view", choices=("config", "runtime", "events"), nargs="?", default="config")
    parser.add_argument("--url", default="http://127.0.0.1:49321/mcp")
    parser.add_argument("--prefix", help="Filter global configuration keys")
    parser.add_argument("--after", type=int, help="Event cursor from the same epoch")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--expect-source", help="Fail if a different checkout is serving")
    args = parser.parse_args()
    version = "2025-11-25"

    def request(method, params=None, request_id=None):
        message = {"jsonrpc": "2.0", "method": method}
        if request_id is not None:
            message["id"] = request_id
        if params is not None:
            message["params"] = params
        req = urllib.request.Request(args.url, json.dumps(message).encode(), headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": version,
        })
        # Local requests must not be routed through a configured HTTP proxy.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=5) as response:
            data = response.read()
            return json.loads(data) if data else None

    try:
        init = request("initialize", {"protocolVersion": version, "capabilities": {},
                       "clientInfo": {"name": "playground-inspect", "version": "1.0.0"}}, 1)
        version = init["result"]["protocolVersion"]
        request("notifications/initialized")
        names = {"config": "get_active_config", "runtime": "get_runtime_state", "events": "get_recent_events"}
        arguments = {}
        if args.view == "config" and args.prefix is not None:
            arguments["prefix"] = args.prefix
        if args.view == "events":
            arguments["limit"] = args.limit
            if args.after is not None:
                arguments["after"] = args.after
        response = request("tools/call", {"name": names[args.view], "arguments": arguments}, 2)
        if "error" in response:
            raise ValueError(response["error"]["message"])
        result = response["result"]
        if result.get("isError"):
            raise ValueError(result["content"][0]["text"])
        value = result["structuredContent"]
        if args.expect_source and value["instance"]["source"] != args.expect_source:
            raise ValueError("Unexpected game source: " + value["instance"]["source"])
        print(json.dumps(value, indent=2))
    except (urllib.error.URLError, ValueError, KeyError) as exc:
        print(f"Game inspection failed at {args.url}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
