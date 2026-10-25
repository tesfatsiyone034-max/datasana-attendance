# DataSana School Attendance Management System

React + Vite + Firebase Authentication + Cloud Firestore.

## 1. Requirements
- Node.js 20 or newer
- A Firebase project: `school-attendance-4a743`
- Firebase Authentication Email/Password enabled
- Cloud Firestore database created

## 2. Run locally
```bash
npm install
npm run dev
```

## 3. Create the first admin safely
1. Open Firebase Console and select project `school-attendance-4a743`.
2. Open Authentication → Sign-in method and enable **Email/Password**.
3. Open Authentication → Users → Add user. Create the administrator's email/password.
4. Copy the new user's **UID**.
5. Open Firestore Database → Data → Start collection. Collection ID: `users`.
6. Document ID: paste the admin UID exactly.
7. Add fields:
   - `name` (string): administrator's display name
   - `email` (string): same email as Auth user
   - `role` (string): `admin`
   - `active` (boolean): `true`
8. Open Firestore Rules and publish the included `firestore.rules` rules. Deploying via Firebase CLI also publishes them.
9. Sign in to the website with that Auth email/password.

**Do not create an admin by allowing users to write their own role.** The included rules prevent a normal user from changing their own role.

## 4. Teacher account setup
1. Create the teacher's email/password account in Firebase Console → Authentication → Users → Add user.
2. Copy their UID.
3. In the app, Admin → Teachers & assignments, enter name, email and UID, then save the profile.
4. Assign the teacher to a class.
5. Share their login credentials securely with the teacher; never put passwords in Firestore.
6. The app creates the teacher's `users/{uid}` profile as role `teacher` and active `true`.

## 5. Student accounts (optional)
For student self-service login, create an Authentication account, then as admin create `users/{uid}` with:
- `name`: student's name
- `email`: student's email
- `role`: `student`
- `active`: `true`
- `studentId`: the Firestore document ID for that student in `students`

The student view shows only attendance records matching that studentId.

## 6. Deploy to Firebase Hosting
Install Firebase CLI on a computer or environment with Node.js:
```bash
npm install
npm run build
npx firebase-tools login
npx firebase-tools deploy --project school-attendance-4a743
```
When prompted or if needed, select Hosting and Firestore rules. The supplied `firebase.json` deploys the `dist` folder and includes SPA rewrites. The target URL should be:
`https://school-attendance-4a743.web.app`

If you already have a Hosting site with that ID, deploy to the matching Firebase project. If CLI reports site/project mismatch, open Firebase Console → Hosting and confirm the Hosting site belongs to `school-attendance-4a743`.

## 7. Firestore collections
- `users/{uid}`: role/profile; role is admin, teacher, or student.
- `classes/{classId}`: name, grade, section.
- `students/{studentId}`: name, studentCode, classId, gender, guardianPhone.
- `teachers/{uid}`: name, email, uid.
- `assignments/{uid_classId}`: teacherId, classId, teacherName, className.
- `attendance/{date_classId_studentId}`: date, classId, studentId, studentName, studentCode, status, teacherId, updatedAt.

Attendance rate is (Present + Late) / (Present + Absent + Late) × 100; Excused is excluded. If there are no eligible records, rate is N/A.

## Important security notes
- Firebase web config is public client configuration; do not put service-account keys or passwords in frontend code.
- Firestore rules are a starting point for this app. Test with separate admin and teacher accounts before using real student records.
- Admin must be bootstrapped by a trusted person in Firebase Console as described above.
- The teacher creation UI registers teacher profile documents, not Auth users. Firebase client SDK cannot securely create another user's password account while preserving the current admin session without a trusted backend.


## Profile error troubleshooting

This build distinguishes a missing Firestore user document from a profile read failure. If you see `PROFILE_READ_FAILED (permission-denied)`, check the exact Firebase project, the signed-in Authentication UID, and the published Firestore rules. This code does not bypass security rules or automatically grant admin access.
