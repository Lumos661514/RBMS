# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary design priority: **store managers / admins** operating the back office (board, employees, services, occupancy/revenue, settings).

Secondary audience: **customers** who register, browse services, book slots, and manage their own upcoming appointments.

## Product Purpose

A booking admin system for service-type stores. Customers self-serve appointments; managers run capacity, staff, and day-to-day bookings from a separate admin shell. Success means managers can see and control the day’s slots without customers leaking into admin routes (and vice versa), and appointments respect real capacity (staff availability, leave, and slot rules).

## Positioning

**Dual-portal separation**: one product, two role-bound shells (admin vs customer) with separate menus, layouts, and home routes—not a single shared app with role-toggled menus.

## Operating Context

- Local/dev: Vue SPA + Express API; Vite proxies `/api`; MySQL 8 persistence.
- Live demo: http://120.27.130.34
- Source: https://github.com/Lumos661514/RBMS
- Interview / portfolio demo of full-stack frontend work is a primary evaluation context.
- Manager workflows center on the schedule board from “today” forward, staff leave within business hours, service catalog CRUD, user search/password/delete, and occupancy/revenue stats.
- Customer workflows: service intro → pick date/staff/slot → “My” account for password and cancellable upcoming bookings (no cancel inside 30 minutes of start).

## Capabilities and Constraints

Confirmed:
- Roles: `admin` (built-in) and `user` (self-register); portals must not cross.
- Admin home `/board`; customer home `/book`.
- Booking rules: past start times not bookable; one staff per user per overlapping slot; staff cannot double-book; leave removes capacity; slot closes only when eligible on-duty staff are full; admin can book on behalf of users (not self).
- Service duration must be an integer multiple of the configured slot length (min 30 minutes, step 30); business hours and board column count are admin settings.
- Passwords hashed; auth via JWT.

Open / undecided:
- No bound real store brand or vertical for product identity (demo data may look industry-specific; UI should stay generic service-store booking).
- No product-mandated accessibility standard beyond ordinary web expectations.

## Brand Commitments

None binding. Working product name in docs: **预约后台管理系统** (package `booking-admin`). Do not invent a shop brand, testimonials, or fake case studies.

## Evidence on Hand

- Runnable app and README feature list at repo root.
- Live demo at http://120.27.130.34 (credentials are operational demo data, not marketing proof).
- Resume/print page `introduction.html` is personal career material, not product brand collateral.
- Do not fabricate testimonials, press, benchmarks, or pricing claims.

## Product Principles

1. **Admin-first clarity** — back-office scanability and task completion outrank decorative expression.
2. **Portal integrity** — customer and admin shells stay visually and navigationally distinct; never blend into one ambiguous chrome.
3. **Capacity is truth** — UI must reflect staff leave, slot fullness, and time rules rather than optimistic empty calendars.
4. **Demo honesty** — show real workflows and constraints; do not invent brand story or social proof the product does not have.
5. **Preserve product facts** — names, roles, routes, and booking rules stay unless the user changes them; visual redesign must not rewrite behavior.
