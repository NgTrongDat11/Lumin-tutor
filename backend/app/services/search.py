import unicodedata
import re
from datetime import datetime

def remove_vietnamese_accents(text: str) -> str:
    if not text:
        return ""
    # Normalize unicode to decomposed form (NFD)
    nfd_form = unicodedata.normalize('NFD', text)
    cleaned = "".join([c for c in nfd_form if not unicodedata.combining(c)])
    # Hand-convert specific Vietnamese characters like đ, Đ
    cleaned = cleaned.replace('đ', 'd').replace('Đ', 'D')
    return cleaned

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text_no_accents = remove_vietnamese_accents(text)
    text_lower = text_no_accents.lower()
    cleaned = re.sub(r'\s+', ' ', text_lower).strip()
    return cleaned

def tokenize(text: str) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []
    return [t for t in normalized.split(' ') if t]

def search_tutors(
    tutors: list,
    q: str | None,
    query_tokens: list[str]
) -> list:
    # If q is provided and has content but query_tokens is empty (meaning it is query vô nghĩa, e.g. "!!!")
    if q is not None and q.strip() and not query_tokens:
        return []

    # If no query at all, return the original list (sorting will be handled by default logic)
    if not q or not query_tokens:
        return tutors

    filtered = []
    for profile in tutors:
        name = profile.account.full_name if profile.account else ""
        bio = profile.bio or ""
        area = profile.teaching_area or ""
        
        approved_subjects = [ts for ts in profile.subjects if ts.status == "APPROVED"]
        subjects_str = " ".join([
            f"{ts.subject.name} {ts.grade_level or ''}"
            for ts in approved_subjects
            if ts.subject
        ])
        
        searchable_text = f"{name} {bio} {area} {subjects_str}"
        normalized_searchable = normalize_text(searchable_text)
        
        # Check AND matching
        if all(token in normalized_searchable for token in query_tokens):
            filtered.append(profile)

    # Deterministic Sort
    norm_q = normalize_text(q)
    def tutor_sort_key(profile):
        name = profile.account.full_name if profile.account else ""
        norm_name = normalize_text(name)
        
        # Name match priority
        if norm_name == norm_q:
            name_prio = 0
        elif all(token in norm_name for token in query_tokens):
            name_prio = 1
        else:
            name_prio = 2
            
        # Subject match priority
        approved_subjects = [ts for ts in profile.subjects if ts.status == "APPROVED"]
        subject_prio = 2
        for ts in approved_subjects:
            if ts.subject:
                norm_subj = normalize_text(ts.subject.name)
                if norm_subj == norm_q:
                    subject_prio = min(subject_prio, 0)
                elif all(token in norm_subj for token in query_tokens):
                    subject_prio = min(subject_prio, 1)
                    
        # Area match priority
        area = profile.teaching_area or ""
        norm_area = normalize_text(area)
        if norm_q and norm_q in norm_area:
            area_prio = 0
        elif all(token in norm_area for token in query_tokens):
            area_prio = 1
        else:
            area_prio = 2
            
        rating_prio = -float(profile.average_rating or 0.0)
        created_prio = -float(profile.created_at.timestamp() if getattr(profile, "created_at", None) else 0.0)
        id_prio = profile.id
        
        return (name_prio, subject_prio, area_prio, rating_prio, created_prio, id_prio)

    filtered.sort(key=tutor_sort_key)
    return filtered

def search_classes(
    classes: list,
    q: str | None,
    query_tokens: list[str],
    subject_names: dict[int, str]
) -> list:
    if q is not None and q.strip() and not query_tokens:
        return []

    if not q or not query_tokens:
        return classes

    filtered = []
    for course in classes:
        title = course.title or ""
        goal = course.goal or ""
        location = course.location or ""
        grade = course.grade_level or ""
        subj_name = subject_names.get(course.subject_id, "")
        
        searchable_text = f"{title} {goal} {location} {grade} {subj_name}"
        normalized_searchable = normalize_text(searchable_text)
        
        # Check AND matching
        if all(token in normalized_searchable for token in query_tokens):
            filtered.append(course)

    # Deterministic Sort
    norm_q = normalize_text(q)
    def class_sort_key(course):
        title = course.title or ""
        norm_title = normalize_text(title)
        
        # Title match priority
        if norm_title == norm_q:
            title_prio = 0
        elif all(token in norm_title for token in query_tokens):
            title_prio = 1
        else:
            title_prio = 2
            
        # Subject match priority
        subj_name = subject_names.get(course.subject_id, "")
        norm_subj = normalize_text(subj_name)
        if norm_subj == norm_q:
            subj_prio = 0
        elif all(token in norm_subj for token in query_tokens):
            subj_prio = 1
        else:
            subj_prio = 2
            
        # Location match priority
        location = course.location or ""
        norm_loc = normalize_text(location)
        if norm_q and norm_q in norm_loc:
            loc_prio = 0
        elif all(token in norm_loc for token in query_tokens):
            loc_prio = 1
        else:
            loc_prio = 2
            
        created_prio = -float(course.created_at.timestamp() if getattr(course, "created_at", None) else 0.0)
        id_prio = course.id
        
        return (title_prio, subj_prio, loc_prio, created_prio, id_prio)

    filtered.sort(key=class_sort_key)
    return filtered
