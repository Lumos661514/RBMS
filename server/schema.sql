-- 预约系统表结构；业务主键沿用字符串 id，便于与现有前端字段对齐。
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  builtin TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  start_hour INT NOT NULL,
  end_hour INT NOT NULL,
  day_count INT NOT NULL,
  slot_minutes INT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  duration_hours DECIMAL(4, 2) NOT NULL,
  description VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_services (
  employee_id VARCHAR(32) NOT NULL,
  service_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (employee_id, service_id),
  CONSTRAINT fk_es_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_es_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
);

-- 员工请假时段；结束日可以晚于开始日，重叠格子不计入容量。
CREATE TABLE IF NOT EXISTS employee_leaves (
  id VARCHAR(32) PRIMARY KEY,
  employee_id VARCHAR(32) NOT NULL,
  leave_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_minutes INT NOT NULL,
  end_minutes INT NOT NULL,
  CONSTRAINT fk_el_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  INDEX idx_el_employee_date (employee_id, leave_date)
);

-- 预约不级联删用户，账号删除后记录仍保留。
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(32) PRIMARY KEY,
  date DATE NOT NULL,
  date_display VARCHAR(16) NOT NULL,
  start_hour DECIMAL(4, 2) NOT NULL,
  service_id VARCHAR(32) NOT NULL,
  service_name VARCHAR(64) NOT NULL,
  duration_hours DECIMAL(4, 2) NOT NULL,
  employee_id VARCHAR(32) NOT NULL,
  employee_name VARCHAR(64) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  contact_name VARCHAR(64) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('active', 'done') NOT NULL DEFAULT 'active',
  INDEX idx_date_status (date, status),
  INDEX idx_user (user_id),
  INDEX idx_employee_date (employee_id, date, status)
);
