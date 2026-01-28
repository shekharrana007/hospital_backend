## OPD Token Allocation Engine (Node.js)

This project implements the **hospital OPD token allocation system** described in your assignment using **Node.js (Express)** and a simple **NoSQL JSON datastore** (via `lowdb`).

### UI (easy to use)

After starting the server, open:

- **UI**: `http://localhost:4000/`
- **API docs (JSON)**: `http://localhost:4000/api`

It focuses on:
- **Per-slot hard limits**
- **Dynamic reallocation** when patients cancel, do not show up, or emergencies arrive
- **Prioritisation between token sources** (Emergency, Paid, Follow-up, Online, Walk-in)
- **Simulation of a realistic OPD day** with at least three doctors

### Data model (high level)

- **Doctor**
  - `id`, `name`
  - `startTime`, `endTime` (e.g. `09:00`, `11:00`)
  - `slotDurationMinutes` (e.g. `15`)
  - `maxPatientsPerSlot` (slot capacity / hard limit)

- **Slot**
  - `id`, `doctorId`, `date`
  - `startTime`, `endTime`
  - `capacity` (copied from doctor)

- **Token**
  - `id`, `doctorId`, `slotId`, `date`
  - `patientName`
  - `source` (one of `EMERGENCY`, `PAID`, `FOLLOW_UP`, `ONLINE`, `WALK_IN`)
  - `priorityScore` (derived from source)
  - `status` (`SCHEDULED`, `CANCELLED`, `NO_SHOW`)

### Prioritisation

From highest to lowest:

1. **Emergency** (`EMERGENCY`)
2. **Paid** (`PAID`)
3. **Follow-up** (`FOLLOW_UP`)
4. **Online booking** (`ONLINE`)
5. **Walk-in** (`WALK_IN`)

Higher priority patients can **bump** lower-priority patients to later slots in emergency situations if the day is already full.

### Core allocation logic

- Slots are generated dynamically per doctor + date based on:
  - Working hours (`startTime` → `endTime`)
  - `slotDurationMinutes`
  - `maxPatientsPerSlot`
- **Normal booking** (online, walk-in, paid, follow-up):
  - Find the **earliest slot** with remaining capacity.
  - If none exists, the allocation fails with **409** (day is full).
- **Emergency booking**:
  - First try to find free capacity like a normal booking.
  - If every slot is full, look for the **lowest-priority token** in an earlier slot.
  - If that token has **lower priority** than the emergency:
    - Search later slots for any slot with free capacity.
    - Move the low-priority token to the later free slot.
    - Place the emergency patient into the earlier slot.
  - If no lower-priority token can be bumped, the emergency also fails with **409**.

### Handling cancellations and no-shows

Whenever a token is marked **CANCELLED** or **NO_SHOW**:

- The system looks for the **highest-priority patient in any later slot** the same day for the same doctor.
- That patient is automatically **pulled into the newly freed earlier slot**, making the schedule tighter and fairer.

### API endpoints

- `GET /`  
  Serves the HTML UI.

- `GET /api`  
  API documentation in JSON.

- `GET /api/health`  
  Simple health check.

- `GET /api/stats`  
  Dashboard stats (counts + tokens by status).

- `POST /api/doctors`  
  Create a doctor.
  - Body: `{ "name", "startTime", "endTime", "slotDurationMinutes", "maxPatientsPerSlot" }`

- `GET /api/doctors`  
  List all doctors.

- `POST /api/tokens/allocate`  
  Allocate a token (normal or emergency).
  - Body:
    - `doctorId` (required)
    - `date` (YYYY-MM-DD, required)
    - `patientName` (required)
    - `source` (for non-emergencies: `PAID`, `FOLLOW_UP`, `ONLINE`, `WALK_IN`)
    - `emergency` (boolean; when `true` the request is treated as an emergency)

- `POST /api/tokens/:id/cancel`  
  Cancel a token, trigger rebalancing.

- `POST /api/tokens/:id/no-show`  
  Mark a token as no-show, trigger rebalancing.

- `GET /api/doctors/:id/schedule?date=YYYY-MM-DD`  
  See the slot-wise schedule and allocated tokens for that doctor and date.

- `POST /api/simulate/day`  
  Resets data, creates **3 doctors**, and simulates:
  - Online bookings
  - Paid patients
  - Walk-ins
  - Follow-up patients
  - Cancellations and no-shows
  - Emergency cases that may bump lower-priority tokens  
  Returns the **event log** plus final schedules for all three doctors.

### Running the project

From the project folder (`opd-token-engine-node`):

```bash
npm install
npm start
```

The server will run on `http://localhost:4000`.

- Open the **UI** at `http://localhost:4000/`
- Use the **API** under `http://localhost:4000/api/*`

During development you can use:

```bash
npm run dev
```

This uses `nodemon` to reload the server on file changes.

### Notes on requirements coverage

- **Per-slot hard limits**: enforced via `slot.capacity` and allocation checks (`scheduled.length < slot.capacity`).
- **Prioritisation**: `config.priorities` assigns scores; higher score = higher priority.
- **Dynamic reallocation**:
  - **Cancellation / no-show** pulls the highest-priority later token into the freed earlier slot.
  - **Emergency insertions** can bump a lower-priority token to a later slot if needed.
- **Simulation**: `POST /api/simulate/day` resets DB, creates 3 doctors, and runs mixed events.


