"""Extract only generated output and SQL; never overwrite publisher code/config."""
import pathlib
import sys
import tarfile


def extract(archive, destination):
    root = pathlib.Path(destination).resolve()
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        if len(members) > 100_000 or sum(m.size for m in members) > 1_000_000_000:
            raise ValueError("Preview bundle exceeds limits")
        seen = set()
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            allowed = (path.parts and path.parts[0] == ".open-next"
                       or str(path) == "public/build-info.json"
                       or path.parts[:2] == ("migrations", "accounts")
                       and (member.isdir() or path.suffix == ".sql"))
            if (not allowed or path.is_absolute() or ".." in path.parts
                    or "\\" in member.name or not (member.isfile() or member.isdir())
                    or str(path) in seen):
                raise ValueError("Unexpected Preview bundle entry")
            target = root.joinpath(*path.parts)
            if not target.resolve().is_relative_to(root):
                raise ValueError("Preview bundle escapes its destination")
            seen.add(str(path))
        bundle.extractall(root, members=members, filter="data")


if __name__ == "__main__":
    extract(sys.argv[1], sys.argv[2])
