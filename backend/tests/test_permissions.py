"""권한 규칙(app.core.permissions) 단위 테스트. DB 없이 실행된다."""

from types import SimpleNamespace

from app.core import permissions as perm

# 임원진(활동 미참여), 팀장, 팀원, 미참여 일반부원
officer = SimpleNamespace(id=1, role="officer")
leader = SimpleNamespace(id=2, role="member")
teammate = SimpleNamespace(id=3, role="member")
outsider = SimpleNamespace(id=4, role="member")


def workspace(status: str = "진행 중"):
    """leader가 팀장이고 teammate가 팀원인 활동."""
    return SimpleNamespace(leader_id=leader.id, status=status, member_ids=[leader.id, teammate.id])


def test_view_member_or_officer():
    ws = workspace()
    assert perm.can_view_workspace(ws, leader)
    assert perm.can_view_workspace(ws, teammate)
    assert perm.can_view_workspace(ws, officer)  # 임원진은 참여하지 않은 활동도 운영 조회
    assert not perm.can_view_workspace(ws, outsider)


def test_write_requires_membership_and_not_archived():
    assert perm.can_write_workspace(workspace(), teammate)
    assert not perm.can_write_workspace(workspace(), officer)  # 조회 권한이 수정 권한으로 넓어지지 않음
    assert not perm.can_write_workspace(workspace("보관"), leader)


def test_manage_only_leader():
    ws = workspace()
    assert perm.can_manage_workspace(ws, leader)
    assert not perm.can_manage_workspace(ws, teammate)
    assert not perm.can_manage_workspace(ws, officer)
    # 구성원 명단에서 빠진 사람은 leader_id가 남아 있어도 팀장 권한이 없다.
    stale = SimpleNamespace(leader_id=outsider.id, status="진행 중", member_ids=[leader.id])
    assert not perm.is_leader(stale, outsider)


def test_apply_only_outsider_to_open_workspace():
    assert perm.can_apply_workspace(workspace(), outsider)
    assert not perm.can_apply_workspace(workspace(), teammate)
    assert not perm.can_apply_workspace(workspace("완료"), outsider)


def test_reservation_rules():
    ws = workspace()
    assert perm.can_reserve_for(ws, teammate)
    assert perm.can_reserve_for(ws, officer)
    assert not perm.can_reserve_for(ws, outsider)
    assert not perm.can_reserve_for(workspace("보관"), officer)
    assert perm.can_edit_reservation(teammate.id, ws, teammate)  # 본인
    assert perm.can_edit_reservation(teammate.id, ws, leader)  # 팀장
    assert perm.can_edit_reservation(teammate.id, ws, officer)  # 임원진
    assert not perm.can_edit_reservation(teammate.id, ws, outsider)
    assert not perm.can_view_reservation_detail(ws, outsider)


def test_event_rules():
    ws = workspace()
    assert perm.can_edit_event("club", None, officer)
    assert not perm.can_edit_event("club", None, leader)
    assert perm.can_edit_event("workspace", ws, teammate)
    assert not perm.can_edit_event("workspace", ws, officer)
    assert perm.can_view_event("club", [], None, outsider)
    assert perm.can_view_event("workspace", [], ws, officer)
    assert not perm.can_view_event("workspace", [], ws, outsider)
    assert perm.can_view_event("private", [teammate.id], ws, teammate)
    assert not perm.can_view_event("private", [teammate.id], ws, leader)


def test_chat_rules():
    ws = workspace()
    room_members = [leader.id, teammate.id]
    assert perm.can_read_chat(False, room_members, ws, teammate)
    assert not perm.can_read_chat(False, room_members, ws, officer)  # 운영 조회는 대화 내용까지 넓히지 않음
    assert not perm.can_read_chat(True, room_members, ws, teammate)  # 보관된 방
    assert not perm.can_read_chat(False, [leader.id], ws, teammate)  # 초대되지 않은 방
    assert not perm.can_send_chat(False, room_members, workspace("보관"), teammate)
