.PHONY: help install dev dev-server dev-web dev-desktop dev-qt6 build build-contracts test lint fmt typecheck clean dist-desktop dist-desktop-linux dist-desktop-win sync-icons start start-desktop start-qt6 smoke-test-desktop

# Default target: show help
help:
	@echo "Available commands:"
	@echo "  make install             - Install all dependencies"
	@echo "  make dev                 - Run full dev mode (Server + Web)"
	@echo "  make dev-server          - Run Server dev mode"
	@echo "  make dev-web             - Run Web dev mode"
	@echo "  make dev-desktop         - Run Desktop dev mode (Server + Tauri + Web)"
	@echo "  make dev-qt6             - Run QT6 dev mode"
	@echo "  make build               - Build everything (Contracts, Web, Server, Desktop)"
	@echo "  make build-contracts     - Build contracts package"
	@echo "  make start               - Start the server"
	@echo "  make start-desktop       - Start the desktop app (Tauri)"
	@echo "  make start-qt6           - Build and start the QT6 desktop app"
	@echo "  make test                - Run all tests across workspaces"
	@echo "  make smoke-test-desktop  - Run desktop smoke tests"
	@echo "  make lint                - Run linting checks (Biome)"
	@echo "  make fmt                 - Run formatting (Biome)"
	@echo "  make typecheck           - Run TypeScript type checks across workspaces"
	@echo "  make clean               - Remove node_modules and build artifacts"
	@echo "  make dist-desktop        - Build desktop artifact"
	@echo "  make dist-desktop-linux  - Build desktop artifact for Linux"
	@echo "  make dist-desktop-win    - Build desktop artifact for Windows"
	@echo "  make sync-icons          - Sync VSCode icons"

install:
	bun install

dev:
	bun run dev

dev-server:
	bun run dev:server

dev-web:
	bun run dev:web

dev-desktop:
	bun run dev:desktop

dev-qt6:
	bun run dev:qt6

build:
	bun run build

build-contracts:
	bun run build:contracts

start:
	bun run start

start-desktop:
	bun run start:desktop

start-qt6:
	bun run start:qt6

test:
	bun run test

smoke-test-desktop:
	bun run test:desktop-smoke

lint:
	bun run lint

fmt:
	bun run fmt

typecheck:
	bun run typecheck

clean:
	bun run clean

dist-desktop:
	bun run dist:desktop:artifact

dist-desktop-linux:
	bun run dist:desktop:linux

dist-desktop-win:
	bun run dist:desktop:win

sync-icons:
	bun run sync:vscode-icons
