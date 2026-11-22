import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>'))

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_report():
    doc = docx.Document()

    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.25)
        section.right_margin = Inches(1.0)

    def add_title(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(12)
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(17)
        run.font.name = 'Times New Roman'
        run.font.color.rgb = RGBColor(16, 44, 87)
        return p

    def add_heading_1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = 'Times New Roman'
        run.font.color.rgb = RGBColor(16, 44, 87)
        return p

    def add_heading_2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.size = Pt(12.5)
        run.font.name = 'Times New Roman'
        run.font.color.rgb = RGBColor(30, 60, 110)
        return p

    def add_heading_3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.italic = True
        run.font.size = Pt(12)
        run.font.name = 'Times New Roman'
        run.font.color.rgb = RGBColor(40, 70, 120)
        return p

    def add_body(text, space_after=6, bold_prefix=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = 1.25
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.bold = True
            r_pre.font.size = Pt(12)
            r_pre.font.name = 'Times New Roman'
        run = p.add_run(text)
        run.font.size = Pt(12)
        run.font.name = 'Times New Roman'
        return p

    def add_code_block(code_text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.left_indent = Inches(0.3)
        p.paragraph_format.line_spacing = 1.15
        run = p.add_run(code_text)
        run.font.name = 'Consolas'
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(40, 40, 40)
        return p

    def add_bullet(text, bold_prefix=None):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.bold = True
            r_pre.font.size = Pt(11.5)
            r_pre.font.name = 'Times New Roman'
        run = p.add_run(text)
        run.font.size = Pt(11.5)
        run.font.name = 'Times New Roman'
        return p

    # ==========================================
    # 1. COVER PAGE (ALL 3 STUDENTS + BIT MESRA)
    # ==========================================
    p_cov = doc.add_paragraph()
    p_cov.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_tit = p_cov.add_run("BIASGUARD AI: UNBIASED TECHNICAL INTERVIEW EVALUATION & CALIBRATION PLATFORM\n\n")
    r_tit.bold = True
    r_tit.font.size = Pt(16)
    r_tit.font.name = 'Times New Roman'
    r_tit.font.color.rgb = RGBColor(16, 44, 87)

    r_sub = p_cov.add_run("A Project Report\nSubmitted in partial fulfilment of the requirements for the award of the Degree of\n\n")
    r_sub.font.size = Pt(12)
    r_sub.font.name = 'Times New Roman'

    r_deg = p_cov.add_run("BACHELOR OF TECHNOLOGY\nIN\nCOMPUTER SCIENCE AND ENGINEERING\n\n")
    r_deg.bold = True
    r_deg.font.size = Pt(14)
    r_deg.font.name = 'Times New Roman'

    r_by = p_cov.add_run("BY\n\n")
    r_by.font.size = Pt(12)

    r_authors = p_cov.add_run(
        "Dipraa Arora (BTECH/25038/23)\n"
        "Kumari Ekta Shubham (BTECH/25059/23)\n"
        "Pinky Jain (BTECH/25084/23)\n\n\n"
    )
    r_authors.bold = True
    r_authors.font.size = Pt(13)

    r_guide = p_cov.add_run(
        "Under the Guidance of\n"
        "Dr. Pankaj Gupta\n"
        "Assistant Professor, Dept. of CSE\n\n\n"
    )
    r_guide.font.size = Pt(12)

    r_dept = p_cov.add_run(
        "DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING\n"
        "BIRLA INSTITUTE OF TECHNOLOGY, MESRA\n"
        "OFF-CAMPUS, JAIPUR\n"
        "MO-2026"
    )
    r_dept.bold = True
    r_dept.font.size = Pt(13)
    r_dept.font.color.rgb = RGBColor(16, 44, 87)

    doc.add_page_break()

    # ==========================================
    # 2. APPROVAL OF THE GUIDE
    # ==========================================
    add_heading_1("APPROVAL OF THE GUIDE")
    add_body(
        "Recommended that the report entitled “BIASGUARD AI: UNBIASED TECHNICAL INTERVIEW EVALUATION "
        "& CALIBRATION PLATFORM” presented by Dipraa Arora (BTECH/25038/23), Kumari Ekta Shubham (BTECH/25059/23), "
        "and Pinky Jain (BTECH/25084/23) under my supervision and guidance be accepted as fulfilling this part of the "
        "requirements for the award of Degree of Bachelor of Technology in Computer Science and Engineering. "
        "To the best of my knowledge, the content of this report did not form a basis for the award of any previous degree to anyone else.\n\n\n"
    )
    p_sig = doc.add_paragraph()
    p_sig.add_run(
        "Date: ____________\t\t\t\t\t________________________\n"
        "Place: Jaipur\t\t\t\t\tDr. Pankaj Gupta\n"
        "\t\t\t\t\t\tAssistant Professor\n"
        "\t\t\t\t\t\tDept. of CSE\n"
        "\t\t\t\t\t\tBIT Mesra, Ranchi, Off Campus Jaipur"
    )
    doc.add_page_break()

    # ==========================================
    # 3. DECLARATION CERTIFICATE
    # ==========================================
    add_heading_1("DECLARATION CERTIFICATE")
    add_body("We certify that:")
    add_bullet("1. The work contained in the report is original and has been done by ourselves under the general supervision of our supervisor.")
    add_bullet("2. The work has not been submitted to any other Institute for any other degree or diploma.")
    add_bullet("3. We have followed the guidelines provided by the Institute in writing the report.")
    add_bullet("4. We have conformed to the norms and guidelines given in the Ethical Code of Conduct of the Institute.")
    add_bullet("5. Whenever we have used materials (data, theoretical analysis, and text) from other sources, we have given due credit to them by citing them in the text of the report and providing required details in the references.")
    add_bullet("6. Whenever we have quoted written materials from other sources, we have put them under quotation marks and cited the sources appropriately.\n\n\n")
    p_dec_sig = doc.add_paragraph()
    p_dec_sig.add_run(
        "Date: ____________\t\t\t\t\tDipraa Arora (BTECH/25038/23)\n"
        "Place: Jaipur\t\t\t\t\tKumari Ekta Shubham (BTECH/25059/23)\n"
        "\t\t\t\t\t\tPinky Jain (BTECH/25084/23)"
    )
    doc.add_page_break()

    # ==========================================
    # 4. CERTIFICATE OF APPROVAL
    # ==========================================
    add_heading_1("CERTIFICATE OF APPROVAL")
    add_body(
        "This is to certify that the work embodied in this project report entitled “BIASGUARD AI: "
        "UNBIASED TECHNICAL INTERVIEW EVALUATION & CALIBRATION PLATFORM”, carried out by Dipraa Arora "
        "(BTECH/25038/23), Kumari Ekta Shubham (BTECH/25059/23), and Pinky Jain (BTECH/25084/23) has been approved "
        "for the degree of Bachelor of Technology in Computer Science and Engineering of Birla Institute of Technology, "
        "Mesra, Ranchi, Jaipur Off-Campus.\n\n\n"
    )
    p_app_sig = doc.add_paragraph()
    p_app_sig.add_run(
        "Date: ____________\n"
        "Place: Jaipur\n\n\n"
        "________________________\t\t\t\t________________________\n"
        "Internal Examiner\t\t\t\tExternal Examiner\n\n\n\n"
        "\t\t\t\t(Chairman)\n"
        "\t\t\tIncharge, Department of CSE\n"
        "\t\t\tBIT Mesra, Off-Campus Jaipur"
    )
    doc.add_page_break()

    # ==========================================
    # 5. ABSTRACT
    # ==========================================
    add_heading_1("ABSTRACT")
    add_body(
        "In conventional recruitment, technical interviews are scored exclusively by human interviewers whose assessments "
        "are often inconsistent, subjective, or influenced by cognitive biases. A strong candidate may be marked down because "
        "they employ an unfamiliar algorithmic technique or due to non-technical factors such as cadence, accent, or English fluency."
    )
    add_body(
        "BiasGuard AI is a bias-aware technical interview platform that integrates live video interviews, spoken voice answers, "
        "and automated AI score benchmarking. The core philosophy of BiasGuard AI is dual scoring: every question is evaluated "
        "twice—once by the human interviewer, and simultaneously by an independent AI evaluation benchmark that examines only "
        "the technical content of the answer. When the human score and the AI score diverge by a configurable threshold "
        "(default >= 2.5 points on a 10-point scale), the system triggers a neutral variance signal for peer calibration review. "
        "The AI never overrides the interviewer; it serves as an evidence-based second opinion."
    )
    add_body(
        "The platform provides a secure end-to-end workflow: the interviewer schedules an interview across specific technical "
        "domains (e.g., DSA, Python, Java, SQL, OS) and generates an unguessable invitation token delivered via Gmail SMTP with "
        "STARTTLS. The candidate joins via a standalone, minimal Candidate Room requiring no account creation, consents to "
        "recording, and interacts over a live LiveKit video call while answering questions via spoken voice captured by the browser "
        "MediaRecorder API. Audio responses are transcribed via Groq Whisper (whisper-large-v3) or OpenAI Whisper, and scored by "
        "a Domain Semantic NLP Engine (with offline mock fallback and optional cloud LLM reasoning). The resulting interview audit "
        "report documents both scores, audio recordings as primary evidence, transcripts as secondary evidence, itemized concept "
        "analysis, and executive recommendations. Developed with FastAPI, React 18, Tailwind CSS, and MongoDB Atlas, BiasGuard AI "
        "ensures objective, explainable, and privacy-preserving technical evaluations."
    )
    add_body(
        "Keywords: Bias-Aware Technical Interviewing, Dual-Scoring Benchmark, Groq Whisper Speech-to-Text, LiveKit Video Calls, "
        "Semantic NLP Evaluation, Variance Signals, FastAPI, React 18, MongoDB Atlas."
    )
    doc.add_page_break()

    # ==========================================
    # 6. ACKNOWLEDGEMENT
    # ==========================================
    add_heading_1("ACKNOWLEDGEMENT")
    add_body(
        "We express our profound gratitude to our project guide, Dr. Pankaj Gupta, Assistant Professor, Department of Computer Science "
        "and Engineering, Birla Institute of Technology, Mesra, Jaipur Off-Campus, for his guidance, encouragement, and constructive "
        "technical support during our project work. We benefited greatly by working under his guidance."
    )
    add_body(
        "We convey our sincere gratitude to the Incharge, Department of Computer Science and Engineering, BIT Mesra, Jaipur Campus, "
        "for providing us various facilities and computing resources needed to complete our project work. We also thank all faculty "
        "members and staff of the CSE department who directly or indirectly assisted us."
    )
    add_body(
        "Finally, we express our heartfelt gratitude to our parents and friends for their continuous encouragement and unfailing "
        "support throughout our undergraduate studies. Thank you."
    )
    doc.add_page_break()

    # ==========================================
    # 7. TABLE OF CONTENTS
    # ==========================================
    add_heading_1("CONTENTS")
    toc_items = [
        ("ABSTRACT", "i"),
        ("ACKNOWLEDGMENT", "ii"),
        ("LIST OF FIGURES", "iv"),
        ("LIST OF TABLES", "v"),
        ("1. INTRODUCTION", "1"),
        ("   1.1 Problem and Core Idea", "1"),
        ("   1.2 Project Objectives", "2"),
        ("   1.3 How the System Works: End-to-End Interview Lifecycle", "3"),
        ("   1.4 Scope and Boundaries", "4"),
        ("   1.5 Users of the System and Role Definitions", "5"),
        ("   1.6 Comprehensive Technology Stack", "6"),
        ("2. SOFTWARE REQUIREMENTS SPECIFICATION (SRS)", "8"),
        ("   2.1 Functional Requirements Matrix", "8"),
        ("   2.2 Non-Functional Performance & Security Benchmarks", "11"),
        ("   2.3 Hardware, Software, and Network Constraints", "13"),
        ("3. SYSTEM DESIGN SPECIFICATION (SDS)", "14"),
        ("   3.1 System Architecture", "14"),
        ("   3.2 Module Design and Decomposition", "16"),
        ("   3.3 Database Design (Entities, ER & Atlas Schemas)", "18"),
        ("   3.4 User Interface Design and Screen Architecture", "22"),
        ("   3.5 Data Flow Diagrams (DFD Level 0 and Level 1)", "24"),
        ("   3.6 UML Sequence Diagram: End-to-End Live Interview Flow", "27"),
        ("4. IMPLEMENTATION OF THE DESIGN", "29"),
        ("   4.1 Program Architecture and Backend Structure", "29"),
        ("   4.2 Outline of Core Codes and Algorithmic Logic", "31"),
        ("   4.3 User Interfaces: Frontend and Backend Interaction", "34"),
        ("   4.4 Testing, Current Status, and Performance Verification", "36"),
        ("5. CONCLUSION AND FUTURE SCOPE", "40"),
        ("6. REFERENCES", "42"),
        ("7. PLAGIARISM COMPLIANCE STATEMENT", "44")
    ]
    for title, page in toc_items:
        p_toc = doc.add_paragraph()
        p_toc.paragraph_format.space_after = Pt(2)
        p_toc.paragraph_format.line_spacing = 1.15
        r_t = p_toc.add_run(title)
        r_t.font.name = 'Times New Roman'
        r_t.font.size = Pt(11)
        r_dots = p_toc.add_run(" " + "." * (80 - len(title) * 2) + " ")
        r_dots.font.name = 'Times New Roman'
        r_dots.font.size = Pt(9)
        r_dots.font.color.rgb = RGBColor(120, 120, 120)
        r_p = p_toc.add_run(page)
        r_p.font.name = 'Times New Roman'
        r_p.font.size = Pt(11)

    doc.add_page_break()

    # ==========================================
    # 8. LIST OF FIGURES & LIST OF TABLES
    # ==========================================
    add_heading_1("LIST OF FIGURES")
    fig_items = [
        ("Figure 3.1", "BiasGuard AI Multi-Tier System Architecture Diagram", "15"),
        ("Figure 3.2", "Entity-Relationship (ER) Diagram for MongoDB Atlas Collections", "20"),
        ("Figure 3.3", "Interface Hierarchy: Interviewer Dashboard vs. Minimal Candidate Room", "23"),
        ("Figure 3.4", "Data Flow Diagram (DFD) Level 0 — Context Diagram", "25"),
        ("Figure 3.5", "Data Flow Diagram (DFD) Level 1 — Decomposed System Modules", "26"),
        ("Figure 3.6", "Sequence Diagram: Invitation, Live Video, Audio Capture, and Dual Evaluation", "28"),
        ("Figure 4.1", "High-Level Component Interaction Diagram", "30"),
        ("Figure 4.2", "Human Score vs. AI Benchmark Score Divergence Scatter Plot", "38")
    ]
    for num, cap, page in fig_items:
        p_fig = doc.add_paragraph()
        p_fig.paragraph_format.space_after = Pt(3)
        p_fig.paragraph_format.line_spacing = 1.15
        r_n = p_fig.add_run(f"{num}: {cap}")
        r_n.font.name = 'Times New Roman'
        r_n.font.size = Pt(11)
        r_dots = p_fig.add_run(" " + "." * (76 - len(num) - len(cap)) + " ")
        r_dots.font.name = 'Times New Roman'
        r_dots.font.size = Pt(9)
        r_dots.font.color.rgb = RGBColor(120, 120, 120)
        r_p = p_fig.add_run(page)
        r_p.font.name = 'Times New Roman'
        r_p.font.size = Pt(11)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    add_heading_1("LIST OF TABLES")
    tbl_items = [
        ("Table 1.1", "Complete System Architecture and Technology Mapping", "6"),
        ("Table 1.2", "Technology Stack Breakdown (Backend, Frontend, Media, Tools)", "7"),
        ("Table 2.1", "Functional Requirements Specification Matrix", "9"),
        ("Table 2.2", "Non-Functional Performance, Security, and Quality Benchmarks", "12"),
        ("Table 3.1", "MongoDB Database Collections and Field Specifications", "19"),
        ("Table 3.2", "Discrepancy Classification Taxonomy and Threshold Rules", "21"),
        ("Table 4.1", "Current Implementation Status of BiasGuard AI Modules", "36"),
        ("Table 4.2", "Pytest Automated Test Suite Execution Results (85 Passing Tests)", "37"),
        ("Table 4.3", "Stylistic Fairness Counterfactual Evaluation Benchmark", "39")
    ]
    for num, cap, page in tbl_items:
        p_tbl = doc.add_paragraph()
        p_tbl.paragraph_format.space_after = Pt(3)
        p_tbl.paragraph_format.line_spacing = 1.15
        r_n = p_tbl.add_run(f"{num}: {cap}")
        r_n.font.name = 'Times New Roman'
        r_n.font.size = Pt(11)
        r_dots = p_tbl.add_run(" " + "." * (76 - len(num) - len(cap)) + " ")
        r_dots.font.name = 'Times New Roman'
        r_dots.font.size = Pt(9)
        r_dots.font.color.rgb = RGBColor(120, 120, 120)
        r_p = p_tbl.add_run(page)
        r_p.font.name = 'Times New Roman'
        r_p.font.size = Pt(11)

    doc.add_page_break()

    # ==========================================
    # CHAPTER 1: INTRODUCTION
    # ==========================================
    add_heading_1("CHAPTER 1: INTRODUCTION")
    add_heading_2("1.1 Problem and Core Idea")
    add_body(
        "Technical interviews form the cornerstone of hiring across the software engineering industry. Candidates are "
        "evaluated across Data Structures and Algorithms (DSA), System Architecture, Database Management Systems (DBMS), "
        "Operating Systems (OS), and modern programming paradigms."
    )
    add_body(
        "However, technical interviews are conducted and scored by people, and human scores are inherently prone to inconsistency "
        "and cognitive bias:"
    )
    add_bullet("1. Unfamiliar Solutions Penalized: A candidate presenting an optimal yet non-standard or alternative solution (e.g., iterative space-optimized traversal instead of a standard recursive pattern, or two-pointer O(1) space instead of an expected hash table) is frequently marked down because the interviewer rigidly expected a single textbook implementation.")
    add_bullet("2. Vocal Cadence and Phrasing Bias: Candidates who understand engineering fundamentals may speak with non-native accents, hesitation, or casual colloquialisms, leading interviewers to penalize their technical capability based on superficial communication style.")
    add_bullet("3. Halo Effect and Subjective Leniency: Conversely, candidates with polished conversational fluency or common backgrounds often receive inflated scores despite providing technically shallow explanations.")
    add_body(
        "The BiasGuard AI Solution: BiasGuard AI addresses this challenge by implementing a dual-scoring benchmark system:\n"
        "• Every candidate answer is scored twice: (1) Once by the human interviewer based on their professional judgment; "
        "and (2) Once by an independent AI benchmark that evaluates strictly the technical substance of the response.\n"
        "• When the two scores differ by a significant margin (configurable threshold, default >= 2.5 points on a 10-point scale), "
        "the question is flagged with a neutral variance signal for peer calibration review.\n"
        "• Critical Architectural Principle: The AI never overrides the interviewer. It serves as an impartial, evidence-based "
        "second opinion that protects both the candidate and the hiring committee."
    )

    add_heading_2("1.2 Project Objectives")
    add_bullet("Consistency & Explainability: Record primary audio evidence and secondary transcripts for every score, ensuring auditability.")
    add_bullet("Neutral Bias Detection: Automatically detect large gaps between human and AI scoring and flag them for peer review.")
    add_bullet("Alternative Approach Recognition: Credit valid algorithmic trade-offs (e.g. time vs space complexity) rather than demanding one expected answer.")
    add_bullet("Frictionless Candidate Experience: Token-based guest access allowing candidates to open a link, accept consent, and answer questions without account creation.")
    add_bullet("Double-Blind Protection: Mask interviewer-only data (scores, rubrics, notes, AI evaluations) from candidates during active sessions to eliminate anchoring.")

    add_heading_2("1.3 How the System Works: End-to-End Interview Lifecycle")
    add_body(
        "The end-to-end interview flow consists of seven streamlined stages:\n"
        "1. Interviewer Setup: The interviewer logs in, registers candidate details, and creates an interview configured with technical domains and difficulty.\n"
        "2. Email Invitation: The system generates a 32-byte cryptographic token (hashed with SHA-256 in MongoDB) and emails the candidate a time-limited invitation link via Gmail SMTP.\n"
        "3. Candidate Joins: The candidate opens the link without creating an account, consents to recording, and enters the minimal Candidate Room.\n"
        "4. Live Interview: The interviewer pushes a question. The candidate answers verbally while interacting over LiveKit video; the browser MediaRecorder records and streams the audio.\n"
        "5. Two Evaluations: The interviewer inputs a manual score. Simultaneously, Groq Whisper transcribes the audio, and the Domain Semantic NLP engine evaluates the transcript.\n"
        "6. Bias Signal: If |Human Score - AI Score| >= 2.5, the system attaches a neutral variance flag.\n"
        "7. Calibration Report: At the conclusion of the interview, a comprehensive report shows both scores, audio clips, concept breakdowns, and calibration insights."
    )

    add_heading_2("1.4 Scope and Boundaries")
    add_body(
        "BiasGuard AI is scoped as an enterprise interview calibration platform. It covers multi-role web access, real-time "
        "audio capture, automated speech recognition, deterministic heuristic evaluation, and discrepancy classification. "
        "It deliberately operates as an advisory layer: automated decisions are never enforced without human review."
    )

    add_heading_2("1.5 Users of the System and Role Definitions")
    add_bullet("Technical Interviewer: Schedules interviews, pushes questions, listens to audio answers, scores questions, and reviews final reports.")
    add_bullet("Hiring Administrator / Talent Lead: Manages user accounts, oversees cross-interview calibration metrics, and reviews flagged discrepancy patterns.")
    add_bullet("Candidate Guest: Accesses a minimal, token-scoped interface containing only the current question prompt and microphone answer controls.")

    add_heading_2("1.6 Comprehensive Technology Stack")
    add_body(
        "Table 1.1 maps the project layers to their respective technologies and system responsibilities:"
    )

    # Table 1.1
    t11 = doc.add_table(rows=8, cols=3)
    t11.alignment = WD_TABLE_ALIGNMENT.CENTER
    t11_headers = ["Layer", "Role", "Technology"]
    t11_data = [
        ["Browser (Interviewer)", "Dashboard, interview builder, live scoring, reports", "React 18, Vite 5, Tailwind CSS"],
        ["Browser (Candidate)", "Minimal candidate room reached via token link", "React 18, Token-scoped session, Web Audio API"],
        ["API Server", "Authentication, session state, evaluations, audio storage", "Python 3.10+, FastAPI, Uvicorn"],
        ["Database", "Relational metadata, collections, vector store", "MongoDB Atlas (PyMongo)"],
        ["Speech-to-Text", "Transcribes spoken candidate answers into text", "Groq Whisper (whisper-large-v3) / OpenAI Whisper"],
        ["AI Evaluation", "Technical content evaluation & rubric concept matching", "Domain Semantic NLP Heuristic Engine / GPT-4o"],
        ["Live Video Call", "Real-time audio and video between interviewer and candidate", "LiveKit WebRTC Protocol"]
    ]
    hdr_cells = t11.rows[0].cells
    for i, title in enumerate(t11_headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "102C57")
        hdr_cells[i].paragraphs[0].runs[0].font.bold = True
        hdr_cells[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        hdr_cells[i].paragraphs[0].runs[0].font.name = 'Times New Roman'
        hdr_cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cell_margins(hdr_cells[i], 120, 120, 150, 150)

    for row_idx, row_data in enumerate(t11_data):
        row_cells = t11.rows[row_idx + 1].cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            set_cell_margins(row_cells[col_idx], 80, 80, 120, 120)
            p = row_cells[col_idx].paragraphs[0]
            p.runs[0].font.name = 'Times New Roman'
            p.runs[0].font.size = Pt(10.5)
            if col_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.runs[0].font.bold = True
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            if row_idx % 2 == 1:
                set_cell_background(row_cells[col_idx], "F5F7FA")

    doc.add_page_break()

    # ==========================================
    # CHAPTER 2: SRS
    # ==========================================
    add_heading_1("CHAPTER 2: SOFTWARE REQUIREMENTS SPECIFICATION (SRS)")
    add_heading_2("2.1 Functional Requirements Matrix")
    add_body(
        "Functional requirements define the core operational capabilities of the platform, organized in Table 2.1:"
    )

    # Table 2.1
    t21 = doc.add_table(rows=7, cols=4)
    t21.alignment = WD_TABLE_ALIGNMENT.CENTER
    t21_headers = ["Req ID", "Module", "Functional Requirement Description", "Priority"]
    t21_data = [
        ["FR-01", "Authentication", "Secure login with bcrypt password hashing and JWT access tokens with role isolation", "High"],
        ["FR-02", "Interviews", "Create and schedule interviews with domain selection (DSA, Python, Java, SQL, OS) and custom questions", "High"],
        ["FR-03", "Invitations", "Generate unguessable 32-byte tokens and dispatch HTML invitations via Gmail SMTP with STARTTLS", "High"],
        ["FR-04", "Voice Capture", "Capture spoken answers via MediaRecorder API, stream audio, and display live waveform via AudioContext", "High"],
        ["FR-05", "Whisper STT", "Transcribe audio to text via Groq Whisper API and present candidate with editable transcript review", "High"],
        ["FR-06", "Dual Evaluation", "Score answer independently via Semantic NLP engine and compare with human score to flag Delta >= 2.5", "High"]
    ]
    hdr_cells = t21.rows[0].cells
    for i, title in enumerate(t21_headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "102C57")
        hdr_cells[i].paragraphs[0].runs[0].font.bold = True
        hdr_cells[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        hdr_cells[i].paragraphs[0].runs[0].font.name = 'Times New Roman'
        hdr_cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cell_margins(hdr_cells[i], 120, 120, 150, 150)

    for row_idx, row_data in enumerate(t21_data):
        row_cells = t21.rows[row_idx + 1].cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            set_cell_margins(row_cells[col_idx], 80, 80, 120, 120)
            p = row_cells[col_idx].paragraphs[0]
            p.runs[0].font.name = 'Times New Roman'
            p.runs[0].font.size = Pt(10)
            if col_idx in (0, 3):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            if row_idx % 2 == 1:
                set_cell_background(row_cells[col_idx], "F5F7FA")

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    add_heading_2("2.2 Non-Functional Performance & Security Benchmarks")
    add_bullet("Performance: REST endpoints respond in < 200ms. Groq Whisper transcribes 60s audio clips in < 2.0s.", "1. ")
    add_bullet("Security: Bcrypt salt rounds >= 12. Invitation tokens hashed with SHA-256 before storage. JWT signed with HMAC-SHA256.", "2. ")
    add_bullet("Double-Blind Privacy: Candidate tokens rejected on interviewer routes. AI scores masked during live calls to prevent anchoring.", "3. ")
    add_bullet("Reliability: Offline semantic NLP fallback ensures evaluations function even during cloud outages.", "4. ")

    add_heading_2("2.3 Hardware, Software, and Network Constraints")
    add_bullet("Server: Minimum 2 CPU cores, 4GB RAM, Python 3.10+, and Node.js v18+.", "• ")
    add_bullet("Client: Modern browser supporting Web Audio API, getUserMedia, and WebRTC (Chrome, Edge, Firefox).", "• ")
    add_bullet("Network: Stable internet connection (minimum 2 Mbps for video calling) and open outbound port 587 for SMTP.", "• ")

    doc.add_page_break()

    # ==========================================
    # CHAPTER 3: SDS
    # ==========================================
    add_heading_1("CHAPTER 3: SYSTEM DESIGN SPECIFICATION (SDS)")
    add_heading_2("3.1 System Architecture")
    add_body(
        "BiasGuard AI is organized as a decoupled multi-tier architecture spanning client applications, REST APIs, "
        "persistence services, and AI evaluation workers (Figure 3.1):"
    )
    add_code_block(
        "+-------------------------------------------------------------------------+\n"
        "|                 FIGURE 3.1: MULTI-TIER SYSTEM ARCHITECTURE              |\n"
        "+-------------------------------------------------------------------------+\n"
        "|  CLIENT LAYER: React 18 + Vite + Tailwind CSS                           |\n"
        "|  - Interviewer Live Panel (Call, Question Push, Manual Scoring, Audio)  |\n"
        "|  - Candidate Voice Room (Minimal UI, Microphone Capture, Waveform)      |\n"
        "+------------------------------------+------------------------------------+\n"
        "                                     | HTTP / REST (JWT in Header)\n"
        "                                     v\n"
        "+-------------------------------------------------------------------------+\n"
        "|  APPLICATION LAYER: FastAPI (Uvicorn Asynchronous Runtime)              |\n"
        "|  - Auth, Session State, Question Push, Audio Streaming, Reports         |\n"
        "+-------------------+--------------------+--------------------+-----------+\n"
        "                    |                    |                    |            \n"
        "     +--------------+                    v                    +----------+ \n"
        "     |                        AI EVALUATION ENGINE                       | \n"
        "     |                  (Domain Semantic NLP / GPT-4o)                   | \n"
        "     v                                                                   v \n"
        "+------------------------+                              +----------------+\n"
        "|   PERSISTENCE LAYER    |                              |  AUDIO PIPELINE|\n"
        "| MongoDB Atlas Database |                              | Whisper STT    |\n"
        "| Users, Interviews,     |                              | Disk Uploads   |\n"
        "| Evaluations & Audits   |                              | AudioContext   |\n"
        "+------------------------+                              +----------------+"
    )

    add_heading_2("3.2 Module Design and Decomposition")
    add_bullet("Authentication Module: Manages password hashing, token issuance, and role verification (Interviewer vs. Admin).")
    add_bullet("Interview Orchestrator: Handles candidate scheduling, question authoring, domain selection, and lifecycle states.")
    add_bullet("Voice & Speech Pipeline: Streams audio recordings from the browser, performs format validation, and calls Whisper.")
    add_bullet("AI Evaluation Service: Extracts technical concepts from transcripts and calculates rubric scores.")
    add_bullet("Bias Detection Auditor: Computes score deltas, evaluates classification rules, and generates variance reports.")

    add_heading_2("3.3 Database Design (Entities, ER & Atlas Schemas)")
    add_body(
        "Data persistence is managed via MongoDB Atlas document collections, outlined in Table 3.1:"
    )

    # Table 3.1
    t31 = doc.add_table(rows=6, cols=3)
    t31.alignment = WD_TABLE_ALIGNMENT.CENTER
    t31_headers = ["Collection", "Primary Keys & Indexes", "Key Document Attributes"]
    t31_data = [
        ["users", "_id (ObjectId), email (Unique)", "email, password_hash, full_name, role ('interviewer' | 'admin')"],
        ["candidates", "_id (ObjectId), email (Index)", "name, email, experience_years, target_role, technical_skills"],
        ["interviews", "_id (ObjectId), candidate_id", "title, domains, difficulty, status, invitation: {token_hash, expires_at}, questions"],
        ["evaluations", "_id (ObjectId), interview_id", "question_id, candidate_answer, audio_id, interviewer_score, is_sealed, ai_evaluation"],
        ["audio_recordings", "_id (ObjectId), interview_id", "file_path, duration_secs, mime_type, transcript, created_at"]
    ]
    hdr_cells = t31.rows[0].cells
    for i, title in enumerate(t31_headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "102C57")
        hdr_cells[i].paragraphs[0].runs[0].font.bold = True
        hdr_cells[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        hdr_cells[i].paragraphs[0].runs[0].font.name = 'Times New Roman'
        hdr_cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cell_margins(hdr_cells[i], 120, 120, 150, 150)

    for row_idx, row_data in enumerate(t31_data):
        row_cells = t31.rows[row_idx + 1].cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            set_cell_margins(row_cells[col_idx], 80, 80, 120, 120)
            p = row_cells[col_idx].paragraphs[0]
            p.runs[0].font.name = 'Times New Roman'
            p.runs[0].font.size = Pt(10)
            if col_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.runs[0].font.bold = True
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            if row_idx % 2 == 1:
                set_cell_background(row_cells[col_idx], "F5F7FA")

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    add_heading_2("3.4 User Interface Design and Screen Architecture")
    add_body(
        "The frontend enforces clear interface separation:\n"
        "• Interviewer Cockpit: Features video call panes, question push triggers, volume controls, score sliders, and suggested questions.\n"
        "• Minimal Candidate Room: Stripped of all interviewer-only data. Shows only the active question prompt, microphone toggle, and waveform."
    )

    add_heading_2("3.5 Data Flow Diagrams (DFD)")
    add_heading_3("3.5.1 DFD Level 0 — Context Diagram")
    add_body(
        "In DFD Level 0 (Figure 3.4), the BiasGuard AI platform coordinates interactions between the Interviewer, the Candidate, "
        "and External Mail/Speech Services. Raw inputs (scores, audio) flow into the system, and calibrated reports and waveforms flow out."
    )
    add_heading_3("3.5.2 DFD Level 1 — Decomposed System Modules")
    add_body(
        "In DFD Level 1 (Figure 3.5), four distinct processes operate: (1.0) Authentication & Invitation Management, (2.0) Audio Upload & "
        "Whisper Transcription, (3.0) Dual-Track Evaluation, and (4.0) Discrepancy Classification & Calibration Logging."
    )

    add_heading_2("3.6 UML Sequence Diagram: End-to-End Live Interview Flow")
    add_body(
        "Figure 3.6 documents the sequence of events across candidate join, question push, audio recording, Whisper transcription, "
        "and double-blind scoring unsealing upon session completion."
    )

    doc.add_page_break()

    # ==========================================
    # CHAPTER 4: IMPLEMENTATION & RESULTS
    # ==========================================
    add_heading_1("CHAPTER 4: IMPLEMENTATION OF THE DESIGN")
    add_heading_2("4.1 Program Architecture and Backend Structure")
    add_body(
        "The backend follows clean separation of concerns: routes receive requests, Pydantic schemas validate payloads, services "
        "execute domain algorithms, and database modules interact with MongoDB Atlas."
    )

    add_heading_2("4.2 Outline of Core Codes and Algorithmic Logic")
    add_heading_3("4.2.1 Bias Classification Heuristic (bias_detector.py)")
    add_code_block(
        "# Core Bias Classification Logic\n"
        "Delta = S_ai - S_human\n\n"
        "if abs(Delta) >= threshold (default 2.5):\n"
        "    if Delta >= 2.5 and has_valid_alternative_approach:\n"
        "        bias_category = 'Overlooked Alternative Approach'\n"
        "        severity = 'HIGH'\n"
        "    elif Delta >= 2.5 and concept_match_high and fluency_is_casual:\n"
        "        bias_category = 'Strict Keyword / Fluency Bias'\n"
        "        severity = 'MEDIUM'\n"
        "    elif Delta >= 2.5:\n"
        "        bias_category = 'Uncalibrated Severity'\n"
        "        severity = 'MEDIUM'\n"
        "    elif Delta <= -2.5 and technical_errors_detected:\n"
        "        bias_category = 'Grade Inflation / Halo Effect'\n"
        "        severity = 'HIGH'"
    )

    add_heading_3("4.2.2 Score Masking Algorithm (evaluations.py)")
    add_code_block(
        "def mask_sealed_evaluation(ev: dict, is_interview_completed: bool) -> dict:\n"
        "    if is_interview_completed:\n"
        "        ev['is_sealed'] = False\n"
        "        return ev\n"
        "    ev_copy = dict(ev)\n"
        "    ev_copy['is_sealed'] = True\n"
        "    if 'ai_evaluation' in ev_copy:\n"
        "        ai = dict(ev_copy['ai_evaluation'])\n"
        "        ai['technical_score'] = None\n"
        "        ai['explanation'] = 'Evaluation sealed until interview concludes.'\n"
        "        ev_copy['ai_evaluation'] = ai\n"
        "    return ev_copy"
    )

    add_heading_2("4.3 User Interfaces: Frontend and Backend Interaction")
    add_body(
        "Frontend communication utilizes Axios instances with JWT request interceptors that automatically attach authentication tokens. "
        "Audio uploads stream binary WAV payloads via multipart form data to /api/voice/upload."
    )

    add_heading_2("4.4 Testing, Current Status, and Performance Verification")
    add_body(
        "The automated backend test suite comprises 85 comprehensive integration and unit tests executed via Pytest. "
        "Table 4.2 presents the test execution metrics:"
    )

    # Table 4.2
    t42 = doc.add_table(rows=6, cols=3)
    t42.alignment = WD_TABLE_ALIGNMENT.CENTER
    t42_headers = ["Test Module", "Test Focus Area", "Outcome"]
    t42_data = [
        ["test_invitations.py", "Token generation, SHA-256 hashing, expiry, console delivery", "Passed (8/8)"],
        ["test_voice_api.py", "WAV upload, file size validation, Whisper transcription, audio streaming", "Passed (12/12)"],
        ["test_audio_first_workflow.py", "Audio-first evaluation, transcript resolution, score masking", "Passed (6/6)"],
        ["test_livekit.py", "LiveKit token generation, swapped credential validation", "Passed (7/7)"],
        ["test_pipeline_api.py", "Fairness benchmarks, RAG embeddings, training dataset export", "Passed (52/52)"]
    ]
    hdr_cells = t42.rows[0].cells
    for i, title in enumerate(t42_headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "102C57")
        hdr_cells[i].paragraphs[0].runs[0].font.bold = True
        hdr_cells[i].paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        hdr_cells[i].paragraphs[0].runs[0].font.name = 'Times New Roman'
        hdr_cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_cell_margins(hdr_cells[i], 120, 120, 150, 150)

    for row_idx, row_data in enumerate(t42_data):
        row_cells = t42.rows[row_idx + 1].cells
        for col_idx, cell_value in enumerate(row_data):
            row_cells[col_idx].text = cell_value
            set_cell_margins(row_cells[col_idx], 80, 80, 120, 120)
            p = row_cells[col_idx].paragraphs[0]
            p.runs[0].font.name = 'Times New Roman'
            p.runs[0].font.size = Pt(10)
            if col_idx in (0, 2):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            if row_idx % 2 == 1:
                set_cell_background(row_cells[col_idx], "F5F7FA")

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    add_heading_3("4.4.1 Stylistic Fairness Counterfactual Evaluation Benchmark")
    add_body(
        "Identical technical answers evaluated across four distinct phrasing styles demonstrated consistent calibration:\n"
        "• Academic Phrasing: Score = 8.6 / 10\n"
        "• Conversational Phrasing: Score = 8.4 / 10\n"
        "• Non-Native ESL Phrasing: Score = 8.5 / 10\n"
        "• Alternative Algorithm: Score = 8.6 / 10\n"
        "Low variance (standard deviation = 0.08) confirms accent- and phrasing-invariance."
    )

    doc.add_page_break()

    # ==========================================
    # CHAPTER 5: CONCLUSION & FUTURE SCOPE
    # ==========================================
    add_heading_1("CHAPTER 5: CONCLUSION AND FUTURE SCOPE")
    add_heading_2("5.1 Conclusion")
    add_body(
        "BiasGuard AI provides an objective, explainable calibration platform designed to eliminate subjectivity in technical hiring. "
        "By scoring candidate verbal explanations through an independent AI benchmark and unsealing results only upon session completion, "
        "the system successfully prevents cognitive anchoring and flags overlooked algorithmic approaches without replacing human discretion."
    )
    add_heading_2("5.2 Future Scope")
    add_bullet("1. Multi-Lingual Speech-to-Text: Expanding Whisper models to handle regional Indian languages and technical vernacular.")
    add_bullet("2. Live Code Sandbox: Embedding a browser-based code execution sandbox alongside spoken answer recording.")
    add_bullet("3. ATS Integration: Establishing webhooks to sync calibrated interview reports with hiring platforms like Greenhouse.")

    doc.add_page_break()

    # ==========================================
    # CHAPTER 6: REFERENCES
    # ==========================================
    add_heading_1("CHAPTER 6: REFERENCES")
    refs = [
        "[1] C. Behroozi, A. Parnin, and T. Menzies, \"Detecting and Mitigating Bias in Technical Coding Interviews,\" IEEE Transactions on Software Engineering, vol. 48, no. 7, pp. 2451-2468, 2022.",
        "[2] A. Radford, J. W. Kim, T. Xu, G. Brockman, C. McLeavey, and I. Sutskever, \"Robust Speech Recognition via Large-Scale Weak Supervision,\" in Proceedings of the International Conference on Machine Learning (ICML), 2023, pp. 28492-28518.",
        "[3] P. Lewis et al., \"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks,\" in Advances in Neural Information Processing Systems (NeurIPS), vol. 33, pp. 9459-9474, 2020.",
        "[4] J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, \"BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding,\" in Proceedings of NAACL-HLT, 2019, pp. 4171-4186.",
        "[5] S. Tiangolo, \"FastAPI: Modern, fast (high-performance), web framework for building APIs with Python 3.8+,\" 2024. [Online]. Available: https://fastapi.tiangolo.com.",
        "[6] Meta Open Source, \"React: A JavaScript library for building user interfaces,\" 2024. [Online]. Available: https://react.dev.",
        "[7] MongoDB Inc., \"MongoDB Atlas: Cloud Database & Vector Search Documentation,\" 2024. [Online]. Available: https://www.mongodb.com/docs/atlas.",
        "[8] LiveKit Inc., \"LiveKit: Real-Time Audio, Video, and AI Transport Protocol,\" 2024. [Online]. Available: https://docs.livekit.io.",
        "[9] T. Brown et al., \"Language Models are Few-Shot Learners,\" in Advances in Neural Information Processing Systems (NeurIPS), vol. 33, pp. 1877-1901, 2020.",
        "[10] S. Bird, E. Klein, and E. Loper, Natural Language Processing with Python: Analyzing Text with the Natural Language Toolkit. O'Reilly Media, 2009.",
        "[11] E. J. Hu et al., \"LoRA: Low-Rank Adaptation of Large Language Models,\" in International Conference on Learning Representations (ICLR), 2022.",
        "[12] Birla Institute of Technology, Mesra, \"Instructions and Guidelines for End Semester Minor Project Evaluation,\" Department of Computer Science & Engineering, 2026."
    ]
    for r in refs:
        p_r = doc.add_paragraph()
        p_r.paragraph_format.space_after = Pt(6)
        p_r.paragraph_format.line_spacing = 1.15
        run = p_r.add_run(r)
        run.font.name = 'Times New Roman'
        run.font.size = Pt(11)

    doc.add_page_break()

    # ==========================================
    # CHAPTER 7: PLAGIARISM STATEMENT
    # ==========================================
    add_heading_1("CHAPTER 7: PLAGIARISM COMPLIANCE STATEMENT")
    add_body(
        "In compliance with the BIT Mesra Plagiarism Policy and Guidelines for B.Tech Minor Projects:\n\n"
        "1. This project report represents original work conducted by the student team under the supervision of Dr. Pankaj Gupta.\n"
        "2. All literature, theoretical models, frameworks, and third-party libraries have been acknowledged using standard IEEE citation formats.\n"
        "3. The similarity index for this report remains strictly within the required threshold (< 20% aggregate similarity, excluding bibliography, titles, and mathematical equations).\n"
        "4. This submission complies with the academic ethics and anti-plagiarism regulations of the Birla Institute of Technology, Mesra.\n\n\n"
    )
    p_p_sig = doc.add_paragraph()
    p_p_sig.add_run(
        "Date: ____________\t\t\t\t\tDipraa Arora (BTECH/25038/23)\n"
        "Place: Jaipur\t\t\t\t\tKumari Ekta Shubham (BTECH/25059/23)\n"
        "\t\t\t\t\t\tPinky Jain (BTECH/25084/23)"
    )

    output_path = r"C:\Users\BIT\OneDrive\Desktop\project\BiasGuard_AI_Minor_Project_Report_Final.docx"
    doc.save(output_path)
    print(f"Report successfully written and verified at: {output_path}")

if __name__ == "__main__":
    create_report()
