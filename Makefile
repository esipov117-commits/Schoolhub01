PYTHON ?= .venv/bin/python
RUFF ?= $(PYTHON) -m ruff

.PHONY: install-dev lint format format-check check test precommit ci

install-dev:
	$(PYTHON) -m pip install -r requirements-dev.txt

lint:
	$(RUFF) check .

format:
	$(RUFF) format .

format-check:
	$(RUFF) format --check .

check:
	$(PYTHON) manage.py check

test:
	$(PYTHON) manage.py test

precommit:
	$(PYTHON) -m pre_commit run --all-files

ci: lint check test
