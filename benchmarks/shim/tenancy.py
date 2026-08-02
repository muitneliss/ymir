"""Per-``user_id`` isolation for the wiki-backed memory shim.

The mem0 harness addresses memories by ``user_id`` (LoCoMo uses
``locomo_<conv>_<run_id>``). The Ymir wiki has no notion of tenancy, so each
``user_id`` gets its own project directory containing its own wiki root.

The qmd collection name is *derived by the wiki CLI itself* as
``basename(dirname(wiki_root)) + "-wiki"`` (see ``src/paths.ts:collectionName``).
We therefore name the project directory after the slugged ``user_id``, which
makes the collection name predictable here and — crucially — guarantees that
``wiki reindex`` and ``wiki query`` address the same collection.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    """Mirror of ``src/paths.ts:slugify`` so Python and TypeScript agree."""
    return _SLUG_STRIP.sub("-", value.lower()).strip("-")


@dataclass(frozen=True)
class Tenant:
    """Filesystem and qmd coordinates for one ``user_id``."""

    user_id: str
    project_dir: Path
    wiki_root: Path
    collection: str

    @property
    def sources_dir(self) -> Path:
        return self.wiki_root / "sources"

    @property
    def notes_dir(self) -> Path:
        return self.wiki_root / "notes"


def tenant_for(workspace: Path, user_id: str) -> Tenant:
    """Resolve the tenant for ``user_id`` beneath ``workspace``.

    ``collection`` must match ``collectionName()`` in the wiki CLI exactly; if
    these ever diverge, searches silently return another tenant's pages.
    """
    if not user_id or not user_id.strip():
        raise ValueError("user_id must be a non-empty string")

    slug = slugify(user_id)
    if not slug:
        raise ValueError(f"user_id {user_id!r} slugs to an empty string")

    project_dir = workspace / "wikis" / slug
    return Tenant(
        user_id=user_id,
        project_dir=project_dir,
        wiki_root=project_dir / "wiki",
        collection=f"{slug}-wiki",
    )
