"""NetLimit -- internet usage control dashboard.

Manages content-category policies and daily time/data quotas for an
organization's users, and exposes the pieces needed to enforce them at the
network edge via Squid (see squid_config.py / squid_helper.py).

Run:
    python -m netlimit.seed          # one-time: create demo data (400 users)
    python -m netlimit.app           # start the dashboard on :5050
"""
import datetime
import io
import os

from flask import Flask, Response, g, jsonify, redirect, render_template, request, url_for
from sqlalchemy import func

from netlimit import log_parser, policy_engine, squid_config
from netlimit.db import SessionLocal, init_db
from netlimit.models import (
    ACTION_ALLOW,
    ACTION_BLOCK,
    ACTION_TIME_RESTRICTED,
    Alert,
    Category,
    CategoryDomain,
    Department,
    PolicyRule,
    UsageRecord,
    User,
)


def _parse_time(value):
    if not value:
        return None
    return datetime.datetime.strptime(value, "%H:%M").time()


def create_app(db_url=None):
    app = Flask(__name__)
    db_url = db_url or os.environ.get("NETLIMIT_DB_URL", "sqlite:///netlimit.db")
    init_db(db_url)

    @app.before_request
    def open_session():
        g.db = SessionLocal()

    @app.teardown_request
    def close_session(exception=None):
        db = g.pop("db", None)
        if db is not None:
            if exception is None:
                db.commit()
            else:
                db.rollback()
            db.close()

    register_routes(app)
    return app


def register_routes(app):
    @app.route("/")
    def dashboard():
        db = g.db
        today = datetime.date.today()

        top_users = (
            db.query(User, func.sum(UsageRecord.minutes_used).label("minutes"))
            .join(UsageRecord, UsageRecord.user_id == User.id)
            .filter(UsageRecord.date == today)
            .group_by(User.id)
            .order_by(func.sum(UsageRecord.minutes_used).desc())
            .limit(10)
            .all()
        )

        blocked_by_category = (
            db.query(Category.name, func.sum(UsageRecord.blocked_attempts).label("attempts"))
            .join(UsageRecord, UsageRecord.category_id == Category.id)
            .filter(UsageRecord.date == today, UsageRecord.blocked_attempts > 0)
            .group_by(Category.name)
            .order_by(func.sum(UsageRecord.blocked_attempts).desc())
            .all()
        )

        alerts_today = (
            db.query(Alert).filter_by(date=today).order_by(Alert.created_at.desc()).limit(20).all()
        )

        return render_template(
            "dashboard.html",
            total_users=db.query(User).count(),
            total_departments=db.query(Department).count(),
            top_users=top_users,
            blocked_by_category=blocked_by_category,
            alerts_today=alerts_today,
            today=today,
        )

    @app.route("/users")
    def users_list():
        db = g.db
        department_id = request.args.get("department_id", type=int)
        search = request.args.get("q", "").strip()

        query = db.query(User)
        if department_id:
            query = query.filter_by(department_id=department_id)
        if search:
            like = f"%{search}%"
            query = query.filter(User.full_name.ilike(like) | User.username.ilike(like))

        users = query.order_by(User.full_name).limit(200).all()
        today = datetime.date.today()
        statuses = {u.id: policy_engine.get_quota_status(db, u, today) for u in users}

        return render_template(
            "users.html",
            users=users,
            statuses=statuses,
            departments=db.query(Department).order_by(Department.name).all(),
            selected_department_id=department_id,
            search=search,
        )

    @app.route("/users/<int:user_id>")
    def user_detail(user_id):
        db = g.db
        user = db.get(User, user_id)
        if user is None:
            return "User not found", 404

        status = policy_engine.get_quota_status(db, user)
        history = (
            db.query(UsageRecord)
            .filter_by(user_id=user.id)
            .order_by(UsageRecord.date.desc())
            .limit(14)
            .all()
        )
        alerts = (
            db.query(Alert).filter_by(user_id=user.id).order_by(Alert.created_at.desc()).limit(20).all()
        )
        return render_template("user_detail.html", user=user, status=status, history=history, alerts=alerts)

    @app.route("/departments", methods=["GET", "POST"])
    def departments():
        db = g.db
        if request.method == "POST":
            name = request.form.get("name", "").strip()
            if name:
                db.add(Department(
                    name=name,
                    daily_time_quota_minutes=int(request.form.get("daily_time_quota_minutes", 120)),
                    daily_data_quota_mb=int(request.form.get("daily_data_quota_mb", 2048)),
                ))
            return redirect(url_for("departments"))

        depts = db.query(Department).order_by(Department.name).all()
        headcounts = {d.id: len(d.users) for d in depts}
        return render_template("departments.html", departments=depts, headcounts=headcounts)

    @app.route("/departments/<int:department_id>/edit", methods=["POST"])
    def edit_department(department_id):
        db = g.db
        dept = db.get(Department, department_id)
        if dept is None:
            return "Department not found", 404
        dept.daily_time_quota_minutes = int(request.form.get("daily_time_quota_minutes", dept.daily_time_quota_minutes))
        dept.daily_data_quota_mb = int(request.form.get("daily_data_quota_mb", dept.daily_data_quota_mb))
        return redirect(url_for("departments"))

    @app.route("/categories", methods=["GET", "POST"])
    def categories():
        db = g.db
        if request.method == "POST":
            name = request.form.get("name", "").strip().lower().replace(" ", "_")
            if name:
                db.add(Category(name=name, description=request.form.get("description", "")))
            return redirect(url_for("categories"))
        cats = db.query(Category).order_by(Category.name).all()
        return render_template("categories.html", categories=cats)

    @app.route("/categories/<int:category_id>/domains", methods=["POST"])
    def add_domain(category_id):
        db = g.db
        domain = request.form.get("domain", "").strip().lower()
        if domain:
            exists = db.query(CategoryDomain).filter_by(category_id=category_id, domain=domain).first()
            if exists is None:
                db.add(CategoryDomain(category_id=category_id, domain=domain))
        return redirect(url_for("categories"))

    @app.route("/policies", methods=["GET", "POST"])
    def policies():
        db = g.db
        if request.method == "POST":
            scope_type = request.form.get("scope_type")
            category_id = request.form.get("category_id", type=int)
            action = request.form.get("action")
            rule = PolicyRule(
                category_id=category_id,
                action=action,
                department_id=request.form.get("scope_id", type=int) if scope_type == "department" else None,
                user_id=request.form.get("scope_id", type=int) if scope_type == "user" else None,
            )
            if action == ACTION_TIME_RESTRICTED:
                rule.restricted_start = _parse_time(request.form.get("restricted_start"))
                rule.restricted_end = _parse_time(request.form.get("restricted_end"))
            db.add(rule)
            return redirect(url_for("policies"))

        rules = db.query(PolicyRule).order_by(PolicyRule.id.desc()).all()
        return render_template(
            "policies.html",
            rules=rules,
            categories=db.query(Category).order_by(Category.name).all(),
            departments=db.query(Department).order_by(Department.name).all(),
            actions=[ACTION_ALLOW, ACTION_BLOCK, ACTION_TIME_RESTRICTED],
        )

    @app.route("/policies/<int:rule_id>/delete", methods=["POST"])
    def delete_policy(rule_id):
        db = g.db
        rule = db.get(PolicyRule, rule_id)
        if rule is not None:
            db.delete(rule)
        return redirect(url_for("policies"))

    @app.route("/reports")
    def reports():
        db = g.db
        date_str = request.args.get("date")
        date = datetime.date.fromisoformat(date_str) if date_str else datetime.date.today()

        rows = []
        for dept in db.query(Department).order_by(Department.name).all():
            minutes = (
                db.query(func.sum(UsageRecord.minutes_used))
                .join(User, User.id == UsageRecord.user_id)
                .filter(User.department_id == dept.id, UsageRecord.date == date)
                .scalar()
            ) or 0
            data_mb = (
                db.query(func.sum(UsageRecord.data_mb_used))
                .join(User, User.id == UsageRecord.user_id)
                .filter(User.department_id == dept.id, UsageRecord.date == date)
                .scalar()
            ) or 0
            blocked = (
                db.query(func.sum(UsageRecord.blocked_attempts))
                .join(User, User.id == UsageRecord.user_id)
                .filter(User.department_id == dept.id, UsageRecord.date == date)
                .scalar()
            ) or 0
            headcount = len(dept.users) or 1
            rows.append({
                "department": dept,
                "minutes": minutes,
                "data_mb": data_mb,
                "blocked": blocked,
                "avg_minutes_per_user": minutes / headcount,
            })

        max_minutes = max((r["avg_minutes_per_user"] for r in rows), default=1) or 1
        return render_template("reports.html", rows=rows, date=date, max_minutes=max_minutes)

    @app.route("/squid-config")
    def squid_config_view():
        db = g.db
        text = squid_config.render_full_config(db)
        if request.args.get("download"):
            return Response(
                text, mimetype="text/plain",
                headers={"Content-Disposition": "attachment; filename=netlimit.conf"},
            )
        return render_template("squid_config.html", config_text=text)

    @app.route("/api/check-access", methods=["POST"])
    def api_check_access():
        db = g.db
        payload = request.get_json(silent=True) or {}
        ip = payload.get("ip", "").strip()
        hostname = payload.get("hostname", "").strip()
        if not ip or not hostname:
            return jsonify({"error": "ip and hostname are required"}), 400

        user = db.query(User).filter_by(ip_address=ip).first()
        if user is None:
            return jsonify({"error": f"No user registered for IP {ip}"}), 404

        result = policy_engine.evaluate_request(db, user, hostname)
        return jsonify(result)

    @app.route("/api/usage/<int:user_id>")
    def api_usage(user_id):
        db = g.db
        user = db.get(User, user_id)
        if user is None:
            return jsonify({"error": "User not found"}), 404
        status = policy_engine.get_quota_status(db, user)
        return jsonify({
            "user": user.full_name,
            "date": status["date"].isoformat(),
            "time": status["time"],
            "data": status["data"],
        })

    @app.route("/api/ingest-log", methods=["POST"])
    def api_ingest_log():
        db = g.db
        if "logfile" in request.files:
            content = request.files["logfile"].read().decode("utf-8", errors="ignore")
        else:
            payload = request.get_json(silent=True) or {}
            content = payload.get("log_text", "")
        if not content.strip():
            return jsonify({"error": "No log content provided"}), 400

        summary = log_parser.ingest_lines(db, io.StringIO(content))
        return jsonify(summary)


if __name__ == "__main__":
    create_app().run(debug=True, host="0.0.0.0", port=5050)
