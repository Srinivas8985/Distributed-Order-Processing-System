const fs = require('fs');
const path = require('path');

const phase8Path = path.join(__dirname, 'Phase-8.postman_collection.json');
const phase9Path = path.join(__dirname, 'Phase-9.postman_collection.json');

const collection = JSON.parse(fs.readFileSync(phase8Path, 'utf8'));

collection.info.name = "Phase 9: Dead Letter Queue & Event Replay";
collection.info.description = "Tests for Phase 9: Triggering poison messages and replaying them via the DLQ API.";

collection.item.push({
  name: "05 Get DLQ Events (Pending)",
  request: {
    method: "GET",
    header: [
      {
        key: "X-Service-Auth",
        value: "dev-service-token-2024"
      }
    ],
    url: {
      raw: "http://localhost:3000/internal/dlq?status=PENDING",
      protocol: "http",
      host: ["localhost"],
      port: "3000",
      path: ["internal", "dlq"],
      query: [
        { key: "status", value: "PENDING" }
      ]
    }
  },
  event: [
    {
      listen: "test",
      script: {
        exec: [
          "if (pm.response.code === 200 && pm.response.json().data.length > 0) {",
          "    pm.environment.set(\"dlqEventId\", pm.response.json().data[0].id);",
          "}"
        ],
        type: "text/javascript"
      }
    }
  ]
});

collection.item.push({
  name: "06 Replay DLQ Event",
  request: {
    method: "POST",
    header: [
      {
        key: "X-Service-Auth",
        value: "dev-service-token-2024"
      }
    ],
    url: {
      raw: "http://localhost:3000/internal/dlq/{{dlqEventId}}/replay",
      protocol: "http",
      host: ["localhost"],
      port: "3000",
      path: ["internal", "dlq", "{{dlqEventId}}", "replay"]
    }
  }
});

fs.writeFileSync(phase9Path, JSON.stringify(collection, null, 2));
console.log('Created Phase 9 collection successfully.');
