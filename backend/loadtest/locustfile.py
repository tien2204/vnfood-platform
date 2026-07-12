"""Load test for VNFood browse/read hot path.

Targets the cacheable, non-rate-limited read endpoints (recipe list + detail +
health). Deliberately avoids the AI recognition endpoints, which load models per
request and are meant to be scaled as a separate tier.

Run (from backend/, using the isolated load-test venv):
    locust -f loadtest/locustfile.py --host http://localhost:8000 \
           --headless -u 100 -r 20 --run-time 60s \
           --html loadtest/report.html --csv loadtest/results
"""
import random

from locust import HttpUser, between, task


class BrowseUser(HttpUser):
    # Think-time between requests. Lower this to push throughput / find the knee.
    wait_time = between(0.5, 1.5)

    def on_start(self):
        # Seed a pool of real recipe ids so detail requests hit existing rows.
        self.recipe_ids = []
        with self.client.get(
            "/api/v1/recipes?page=1&limit=20", name="/recipes (list)", catch_response=True
        ) as resp:
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                self.recipe_ids = [r["id"] for r in data if "id" in r]
            else:
                resp.failure(f"seed list failed: {resp.status_code}")

    @task(3)
    def browse_list(self):
        page = random.randint(1, 20)
        self.client.get(
            f"/api/v1/recipes?page={page}&limit=20", name="/recipes (list)"
        )

    @task(2)
    def recipe_detail(self):
        if not self.recipe_ids:
            return
        rid = random.choice(self.recipe_ids)
        self.client.get(f"/api/v1/recipes/{rid}", name="/recipes/{id} (detail)")

    @task(1)
    def health(self):
        self.client.get("/health", name="/health")
