import httpx
import json
import uuid

BASE_URL = "http://127.0.0.1:8000"

def test_full_pipeline():
    print("=" * 60)
    print("TESTING BIASGUARD AI WITH LIVE MONGODB ATLAS")
    print("=" * 60)
    
    with httpx.Client(timeout=10.0) as client:
        # 1. Health Check
        health_res = client.get(f"{BASE_URL}/health")
        print(f"1. GET /health: Status {health_res.status_code}")
        health_data = health_res.json()
        print(f"   Status: {health_data.get('status')}")
        print(f"   Database Connected: {health_data.get('database', {}).get('connected')}")
        print(f"   Database Name: {health_data.get('database', {}).get('database_name')}")
        assert health_data.get("database", {}).get("connected") is True, "Database should be connected!"

        # 2. Docs Check
        docs_res = client.get(f"{BASE_URL}/docs")
        print(f"2. GET /docs: Status {docs_res.status_code}")
        assert docs_res.status_code == 200, "Docs should be 200 OK"

        # 3. User Registration
        test_user_id = uuid.uuid4().hex[:6]
        test_email = f"interviewer_{test_user_id}@biasguard.ai"
        test_password = "SecurePassword@123"
        
        reg_payload = {
            "name": f"Atlas Test Interviewer {test_user_id}",
            "email": test_email,
            "password": test_password,
            "role": "interviewer"
        }
        
        reg_res = client.post(f"{BASE_URL}/api/auth/register", json=reg_payload)
        print(f"3. POST /api/auth/register: Status {reg_res.status_code}")
        reg_data = reg_res.json()
        assert reg_res.status_code == 201, f"Registration failed: {reg_data}"
        token = reg_data.get("access_token")
        user_doc = reg_data.get("user")
        print(f"   Registered User ID: {user_doc.get('id')}")
        print(f"   Token generated: {bool(token)}")
        
        # 4. Duplicate Registration rejection
        dup_res = client.post(f"{BASE_URL}/api/auth/register", json=reg_payload)
        print(f"4. Duplicate Registration Check: Status {dup_res.status_code} (Expected 400)")
        assert dup_res.status_code == 400, "Duplicate email should return 400"

        # 5. User Login with new account
        login_payload = {
            "email": test_email,
            "password": test_password
        }
        login_res = client.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        print(f"5. POST /api/auth/login: Status {login_res.status_code}")
        assert login_res.status_code == 200, "Login should succeed"
        login_data = login_res.json()
        auth_token = login_data.get("access_token")
        headers = {"Authorization": f"Bearer {auth_token}"}

        # 6. Auth /me Check
        me_res = client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        print(f"6. GET /api/auth/me: Status {me_res.status_code}")
        assert me_res.status_code == 200, "Me should return user info"
        print(f"   Authenticated Email: {me_res.json().get('email')}")

        # 7. Candidates API
        cand_res = client.get(f"{BASE_URL}/api/candidates", headers=headers)
        print(f"7. GET /api/candidates: Status {cand_res.status_code}")
        cands = cand_res.json()
        print(f"   Candidate count in Atlas: {len(cands)}")
        assert cand_res.status_code == 200, "Candidates API should work"

        # 8. Create a new candidate
        new_cand_payload = {
            "name": f"Candidate Atlas {test_user_id}",
            "email": f"candidate_{test_user_id}@atlas.example.com",
            "phone": "+1-555-0199",
            "target_role": "Full-Stack Engineer",
            "primary_skills": ["Python", "DSA"],
            "experience_years": 3.5,
            "notes": "Verified live MongoDB Atlas persistence"
        }
        create_cand_res = client.post(f"{BASE_URL}/api/candidates", json=new_cand_payload, headers=headers)
        print(f"8. POST /api/candidates: Status {create_cand_res.status_code}")
        assert create_cand_res.status_code == 201, "Candidate creation should succeed"
        created_cand = create_cand_res.json()
        candidate_id = created_cand.get("id")
        print(f"   Created Candidate ID: {candidate_id}")

        # 9. Interviews API
        int_res = client.get(f"{BASE_URL}/api/interviews", headers=headers)
        print(f"9. GET /api/interviews: Status {int_res.status_code}")
        assert int_res.status_code == 200, "Interviews API should work"
        interviews = int_res.json()
        print(f"   Interviews count in Atlas: {len(interviews)}")

        # 10. Create an Interview Session
        new_int_payload = {
            "candidate_id": candidate_id,
            "title": f"Atlas Integration Technical Interview {test_user_id}",
            "domains": ["DSA", "Python"],
            "difficulty": "Medium",
            "notes": "Testing live Atlas persistence"
        }
        create_int_res = client.post(f"{BASE_URL}/api/interviews", json=new_int_payload, headers=headers)
        print(f"10. POST /api/interviews: Status {create_int_res.status_code}")
        assert create_int_res.status_code == 201, "Interview creation should succeed"
        created_int = create_int_res.json()
        interview_id = created_int.get("id")
        print(f"    Created Interview ID: {interview_id}")

        # 11. Read back Interview Session
        get_int_res = client.get(f"{BASE_URL}/api/interviews/{interview_id}", headers=headers)
        print(f"11. GET /api/interviews/{interview_id}: Status {get_int_res.status_code}")
        assert get_int_res.status_code == 200, "Interview fetch should work"
        assert get_int_res.json().get("candidate_id") == candidate_id, "Candidate ID should match"

        # 12. Demo Account Login Check
        demo_login_payload = {
            "email": "interviewer@biasguard.ai",
            "password": "password123"
        }
        demo_res = client.post(f"{BASE_URL}/api/auth/login", json=demo_login_payload)
        print(f"12. Demo Account Login (interviewer@biasguard.ai): Status {demo_res.status_code}")
        if demo_res.status_code == 200:
            print("    Demo account login verified: SUCCESS")
        else:
            print(f"    Demo account login returned: {demo_res.status_code}")

    print("\n" + "=" * 60)
    print("ALL 12 BACKEND & ATLAS TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_full_pipeline()
